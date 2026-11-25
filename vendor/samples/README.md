# Test audio

`jfk.wav`: 11 seconds of speech (16 kHz, mono, 16-bit), the line "And so, my fellow Americans, ask not what your
country can do for you, ask what you can do for your country" from John F. Kennedy's 1961 inaugural address.
It is a US government work and in the public domain. It comes from the `samples/` folder of
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT), which uses it as its own test clip.

Used by the Mac self-check (`selfcheck.html`) to time the speech model, and as the input of the whisper.cpp
golden fixtures in `test/fixtures/whispercpp/`. Nothing in the app plays it or sends it anywhere.
