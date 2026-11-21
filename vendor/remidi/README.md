# remidi drum maps (data only)

`js/drummaps-data.js` is generated from the 160 engine note tables in `engines/*.toml` of
[remidi / Drumverter](https://github.com/nullcrimson/remidi) (master, November 2026), licensed under the
MIT License (see `LICENSE`, Copyright (c) 2026 nullcrimson).

Each table says which MIDI note plays which drum ("snare1.rimshot", "hat.open2.tip", "tom.floor1.hit"…)
in one drum engine, e-kit or DAW: General MIDI, Guitar Pro, Superior Drummer 3, EZdrummer, Addictive
Drums 2, BFD, Steven Slate Drums, GetGood Drums, Roland TD, Alesis and more. Only the note tables were
taken. The conversion itself (`js/drummap.js`), including its stand-in rules, is Band Manager's own
JavaScript, modelled on remidi's described approach: decode every note to a shared drum name, then encode
it to the destination's note, falling back to the nearest drum it has.
