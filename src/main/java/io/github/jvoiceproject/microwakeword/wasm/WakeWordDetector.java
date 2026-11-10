/*
 * #%L
 * micro-wakeword4j-wasm
 * %%
 * Copyright (C) 2026 Contributors to micro-wakeword4j-wasm
 * %%
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
 * #L%
 */
package io.github.jvoiceproject.microwakeword.wasm;

import io.github.jvoiceproject.microwakeword.MicroWakeWord;
import io.github.jvoiceproject.microwakeword.WakeWordModel;

import java.io.IOException;

import org.teavm.jso.JSBody;
import org.teavm.jso.JSExport;
import org.teavm.jso.JSObject;
import org.teavm.jso.typedarrays.Int16Array;
import org.teavm.jso.typedarrays.Int8Array;

/**
 * A {@link MicroWakeWord} detector as a JavaScript class.
 *
 * @author Dan Cunningham - Initial contribution
 */
public final class WakeWordDetector {
    private final MicroWakeWord detector;

    private WakeWordDetector(MicroWakeWord detector) {
        this.detector = detector;
    }

    /**
     * Creates a detector for one audio stream. This is a static method rather than a constructor,
     * because TeaVM 0.16 passes only the first two arguments to exported constructors.
     *
     * @param manifest the JSON manifest of the model
     * @param model the contents of the .tflite file
     * @param probabilityCutoff the average probability above which the wake word counts as
     *     detected, or NaN for the cutoff of the model
     * @throws IOException when the model is not supported
     */
    @JSExport
    public static WakeWordDetector create(
            String manifest, Int8Array model, double probabilityCutoff) throws IOException {
        WakeWordModel wakeWordModel = WakeWordModel.load(manifest, model.copyToJavaArray());
        return new WakeWordDetector(
                Double.isNaN(probabilityCutoff)
                        ? new MicroWakeWord(wakeWordModel)
                        : new MicroWakeWord(wakeWordModel, probabilityCutoff));
    }

    /**
     * Processes the next frame of the stream.
     *
     * @param frame {@link MicroWakeWord#FRAME_SIZE} samples of 16 kHz audio
     * @return true when the wake word is detected, see {@link MicroWakeWord#process(short[])}
     */
    @JSExport
    public boolean process(Int16Array frame) {
        return detector.process(samples(frame));
    }

    /**
     * Processes the next frame of the stream without detection, for tests.
     *
     * @return the quantized model output, or {@link MicroWakeWord#NO_OUTPUT} when the frame didn't
     *     complete a model input
     */
    @JSExport
    public int infer(Int16Array frame) {
        return detector.infer(samples(frame));
    }

    /** See {@link MicroWakeWord#getProbability()}. */
    @JSExport
    public float getProbability() {
        return detector.getProbability();
    }

    /** See {@link MicroWakeWord#getFramesAfterWakeWord()}. */
    @JSExport
    public int getFramesAfterWakeWord() {
        return detector.getFramesAfterWakeWord();
    }

    /** See {@link MicroWakeWord#getProbabilityCutoff()}. */
    @JSExport
    public double getProbabilityCutoff() {
        return detector.getProbabilityCutoff();
    }

    /** See {@link WakeWordModel#getWakeWord()}. */
    @JSExport
    public String getWakeWord() {
        return detector.getModel().getWakeWord();
    }

    /** See {@link MicroWakeWord#reset()}. */
    @JSExport
    public void reset() {
        detector.reset();
    }

    /** JavaScript can pass any value here, and a Float32Array would be read as near silence. */
    private static short[] samples(Int16Array frame) {
        if (!isInt16Array(frame)) {
            throw new IllegalArgumentException("Expected the frame as an Int16Array");
        }
        return frame.copyToJavaArray();
    }

    @JSBody(params = "value", script = "return value instanceof Int16Array;")
    private static native boolean isInt16Array(JSObject value);
}
