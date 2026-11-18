"""Ultron 2: i cue sonori di una scena Black Den Motion → un .wav (stessi suoni sintetizzati della skill).
  python3 cue_wav.py cues.json durata uscita.wav"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sfx  # noqa: E402

cues = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
buf = sfx.mix(cues, float(sys.argv[2]))
sfx.write_wav(sys.argv[3], buf)
print(f"sfx: {len(cues)} suoni")
