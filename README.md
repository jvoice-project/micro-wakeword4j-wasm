# microWakeWord for browsers

[![npm](https://img.shields.io/npm/v/@jvoice-project/micro-wakeword4j.svg)](https://www.npmjs.com/package/@jvoice-project/micro-wakeword4j)
[![CI](https://github.com/jvoice-project/micro-wakeword4j-wasm/actions/workflows/build.yml/badge.svg)](https://github.com/jvoice-project/micro-wakeword4j-wasm/actions/workflows/build.yml)

[micro-wakeword4j](https://github.com/jvoice-project/micro-wakeword4j) compiled to WebAssembly with [TeaVM](https://teavm.org), for wake word detection in web pages.
It runs the same code as the Java library, and its model outputs are bit-exact with the TensorFlow Lite reference kernels.

## Installation

```shell
npm install @jvoice-project/micro-wakeword4j
```

The package holds these files:

| File                                   | Contents                                                |
|----------------------------------------|---------------------------------------------------------|
| `micro-wakeword.js`                    | The module to import                                    |
| `micro-wakeword.d.ts`                  | TypeScript types                                        |
| `micro-wakeword.wasm`                  | The library, about 200 KB, or 80 KB gzipped             |
| `teavm-runtime.js`                     | The TeaVM loader that `micro-wakeword.js` imports       |
| `package.json`                         | npm package metadata                                    |
| `README.md`                            | This file                                               |
| `LICENSE`, `NOTICE`, `LICENSE-kissfft` | The licenses of this module and of the code it includes |

Models are not included.
Load them from the [ESPHome model collection](https://github.com/esphome/micro-wake-word-models), the [models bundled with micro-wakeword4j](https://github.com/jvoice-project/micro-wakeword4j/tree/main/src/main/resources/io/github/jvoiceproject/microwakeword/models), or your own files.

## Usage

```js
import { loadMicroWakeWord, FRAME_SIZE } from '@jvoice-project/micro-wakeword4j'

const microWakeWord = await loadMicroWakeWord()
const [manifest, model] = await Promise.all([
  fetch('/models/hey_jarvis.json').then((response) => response.text()),
  fetch('/models/hey_jarvis.tflite').then((response) => response.arrayBuffer())
])
const detector = microWakeWord.createDetector(manifest, model)

// an Int16Array of 16 kHz mono PCM, FRAME_SIZE (160) samples per call
if (detector.process(frame)) {
  console.log(`${detector.getWakeWord()} detected`)
  detector.reset()
}
```

`loadMicroWakeWord()` fetches `micro-wakeword.wasm` from next to `micro-wakeword.js`.
If it is served from somewhere else, pass its URL, or its contents as an `ArrayBuffer`.

The detector behaves like `MicroWakeWord` in the [Java library](https://github.com/jvoice-project/micro-wakeword4j#example).
`createDetector` takes an optional probability cutoff as a third argument, and throws an `Error` when the model is not supported.

### Node.js

Node.js can't fetch local files, so pass the contents of `micro-wakeword.wasm`:

```js
import { readFile } from 'node:fs/promises'
import { loadMicroWakeWord } from '@jvoice-project/micro-wakeword4j'

const wasm = await readFile(new URL(import.meta.resolve('@jvoice-project/micro-wakeword4j/micro-wakeword.wasm')))
const microWakeWord = await loadMicroWakeWord(wasm)
```

## Requirements

The module uses WebAssembly garbage collection and the exception handling instructions with `exnref`, which TeaVM emits:

* Chrome and Edge 137 or later
* Firefox 131 or later
* Safari 18.4 or later, on iOS and iPadOS too
* Node.js 25 or later, or Node.js 22 and 24 with `--experimental-wasm-exnref`

It runs on the main thread and in Web Workers.
It doesn't run in an audio worklet, because the TeaVM loader needs `TextDecoder`, which audio worklets don't provide in every browser.
The loader creates functions with `new Function`, so a Content Security Policy must allow `'unsafe-eval'`.

## Development

You need Java >= 21 and Node.js 22 or later.
The micro-wakeword4j version to compile is set by the `micro-wakeword4j.version` property in `pom.xml`.
Until it is on Maven Central, install it first with `./mvnw install` in a checkout of micro-wakeword4j.

`./mvnw package` builds the npm package in `target/dist`.
`./mvnw verify` also runs `src/test/js/check.mjs` in Node.js.
It checks the WebAssembly build against the models, audio and reference data of the library's `tests` JAR.
Node.js has to be on the `PATH`.
`-DskipTests` or `-Dmaven.test.skip` skips the check.
