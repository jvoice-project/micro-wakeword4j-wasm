/*
 * Copyright (C) 2026 Contributors to micro-wakeword4j-wasm
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Runs the reference tests of micro-wakeword4j against the WebAssembly build.
// Usage: node --experimental-wasm-exnref check.mjs <dist directory> <directory of the unpacked micro-wakeword4j JARs>
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [distDirectory, libraryDirectory] = process.argv.slice(2)
const BUILTIN_DIR = join(libraryDirectory, 'io/github/jvoiceproject/microwakeword/models')
const MODELS_DIR = join(libraryDirectory, 'models')
const AUDIO_DIR = join(libraryDirectory, 'audio')
const REFERENCE_DIR = join(libraryDirectory, 'reference')

// the models and audio of the library version this is built with
const filesEndingIn = (directory, extension) =>
  readdirSync(directory)
    .filter((file) => file.endsWith(extension))
    .sort()
const modelNames = (directory) => filesEndingIn(directory, '.json').map((file) => file.slice(0, -'.json'.length))
const WAVS = filesEndingIn(AUDIO_DIR, '.wav')
const BUILTIN = modelNames(BUILTIN_DIR)
const TEST_MODELS = modelNames(MODELS_DIR)

const { loadMicroWakeWord, FRAME_SIZE, NO_OUTPUT } = await import(
  pathToFileURL(join(distDirectory, 'micro-wakeword.js')).href
)
const microWakeWord = await loadMicroWakeWord(readFileSync(join(distDirectory, 'micro-wakeword.wasm')))

let failures = 0
function check(name, passed, detail = '') {
  const logFn = passed ? console.info : console.warn
  logFn(`${passed ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
  if (!passed) {
    failures++
  }
}

function throws(fn) {
  try {
    fn()
    return null
  } catch (e) {
    return e
  }
}

function modelFiles(name) {
  const directory = BUILTIN.includes(name) ? BUILTIN_DIR : MODELS_DIR
  return [readFileSync(join(directory, `${name}.json`), 'utf8'), readFileSync(join(directory, `${name}.tflite`))]
}

function frames(wav) {
  const bytes = readFileSync(join(AUDIO_DIR, wav))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  while (bytes.toString('ascii', offset, offset + 4) !== 'data') {
    const size = view.getInt32(offset + 4, true)
    // chunks are padded to an even size
    offset += 8 + size + (size & 1)
  }
  const samples = new Int16Array(view.getInt32(offset + 4, true) / 2)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(offset + 8 + i * 2, true)
  }
  const result = []
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += FRAME_SIZE) {
    result.push(samples.subarray(i, i + FRAME_SIZE))
  }
  return result
}

function referenceOutputs(model) {
  const outputs = new Map()
  for (const line of readFileSync(join(REFERENCE_DIR, `${model}.txt`), 'utf8').split('\n')) {
    if (line.trim()) {
      const [wav, ...values] = line.trim().split(' ')
      outputs.set(wav, values.map(Number))
    }
  }
  return outputs
}

function outputs(detector, wavFrames) {
  return wavFrames.map((frame) => detector.infer(frame)).filter((output) => output !== NO_OUTPUT)
}

/** A copy of a model whose main input claims another number of dimensions. */
function withInputShapeLength(model, length) {
  const bytes = Uint8Array.from(model)
  const view = new DataView(bytes.buffer)
  const indirect = (position) => position + view.getUint32(position, true)
  const field = (table, n) => table + view.getUint16(table - view.getInt32(table, true) + 4 + 2 * n, true)
  const element = (vector, index) => indirect(vector + 4 + 4 * index)
  const graph = element(indirect(field(indirect(0), 2)), 0)
  const input = view.getInt32(indirect(field(graph, 1)) + 4, true)
  const tensor = element(indirect(field(graph, 0)), input)
  view.setInt32(indirect(field(tensor, 0)), length, true)
  return bytes
}

const audio = new Map(WAVS.map((wav) => [wav, frames(wav)]))
const sameArray = (a, b) => a.length === b.length && a.every((value, i) => value === b[i])

for (const model of [...BUILTIN, ...TEST_MODELS]) {
  const reference = referenceOutputs(model)
  const mismatches = WAVS.filter((wav) => {
    const detector = microWakeWord.createDetector(...modelFiles(model))
    return !sameArray(outputs(detector, audio.get(wav)), reference.get(wav))
  })
  check(`${model} matches the reference kernels`, mismatches.length === 0, mismatches.join(', '))
}

for (const model of BUILTIN) {
  const detector = microWakeWord.createDetector(...modelFiles(model))
  const wrong = WAVS.filter((wav) => {
    detector.reset()
    const detected = audio.get(wav).some((frame) => detector.process(frame))
    return detected !== wav.startsWith(`${model}_`)
  })
  check(`${model} detects only its wake word`, wrong.length === 0, wrong.join(', '))
}

{
  const [manifest, model] = modelFiles('hey_jarvis')
  const detector = microWakeWord.createDetector(JSON.parse(manifest), model)
  check('takes a parsed manifest', detector.getWakeWord() === 'Hey Jarvis')
  check('uses the cutoff of the manifest by default', detector.getProbabilityCutoff() === 0.97)
  check('takes another cutoff', microWakeWord.createDetector(manifest, model, 0.5).getProbabilityCutoff() === 0.5)

  // stops at the detection, in the middle of the stream
  const detected = audio.get('hey_jarvis_2.wav').some((frame) => detector.process(frame))
  // detection rounds the cutoff down to a multiple of 1/255, as ESPHome does
  const cutoff = Math.fround(Math.floor(0.97 * 255) / 255)
  check('reports the probability of a detection', detected && detector.getProbability() > cutoff, detector.getProbability())
  const framesAfter = detector.getFramesAfterWakeWord()
  check('estimates the frames after the wake word', framesAfter > 0 && framesAfter < 50, framesAfter)
  detector.reset()
  check('starts a new stream on reset', detector.getProbability() === 0 && detector.getFramesAfterWakeWord() === 0)
  check(
    'matches the reference after a reset',
    sameArray(outputs(detector, audio.get('hey_jarvis_1.wav')), referenceOutputs('hey_jarvis').get('hey_jarvis_1.wav'))
  )

  const error = throws(() => detector.process(new Int16Array(100)))
  check('rejects frames of the wrong size', error?.message === 'Expected 160 samples, got 100', error?.message)
  const floats = throws(() => detector.process(new Float32Array(FRAME_SIZE)))
  check('rejects frames that are not 16-bit', floats?.message === 'Expected the frame as an Int16Array', floats?.message)
  const truncated = throws(() => microWakeWord.createDetector(manifest, model.subarray(0, model.length / 2)))
  check('rejects truncated models', truncated?.message === 'Malformed TensorFlow Lite model', truncated?.message)
  check('reads the input shape of a model', !throws(() => microWakeWord.createDetector(manifest, withInputShapeLength(model, 3))))
  for (const length of [-1, 0x7ffffff0]) {
    const malformed = throws(() => microWakeWord.createDetector(manifest, withInputShapeLength(model, length)))
    check(`rejects vector lengths of ${length}`, malformed?.message === 'Malformed TensorFlow Lite model', malformed?.message)
  }
  const invalidCutoff = throws(() => microWakeWord.createDetector(manifest, model, 1.5))
  check('rejects invalid cutoffs', invalidCutoff instanceof Error, invalidCutoff?.message)
}

{
  const all = WAVS.flatMap((wav) => audio.get(wav))
  const detector = microWakeWord.createDetector(...modelFiles('hey_jarvis'))
  const run = () => {
    detector.reset()
    all.forEach((frame) => detector.process(frame))
  }
  for (let i = 0; i < 5; i++) {
    run()
  }
  const rounds = 20
  const start = performance.now()
  for (let i = 0; i < rounds; i++) {
    run()
  }
  const microseconds = ((performance.now() - start) * 1000) / (rounds * all.length)
  console.log(`     ${microseconds.toFixed(1)} µs per 10 ms frame`)
}

if (failures > 0) {
  console.error(`${failures} checks failed`)
}
// exit right away, so that nothing the module left behind can keep the build waiting
process.exit(failures > 0 ? 1 : 0)
