"""Generate and inspect local media fixtures for browser smoke tests."""

import json
import pathlib
import subprocess


def make_fixture(directory, name, audio, *, streaming=False, seconds=3, size="160x90"):
    path = directory / name
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30",
    ]
    if audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"]
    mp4 = path.suffix == ".mp4"
    command += ["-t", str(seconds), "-c:v", "libx264" if mp4 else "libvpx"]
    command += ["-c:a", "aac" if mp4 else "libopus"] if audio else ["-an"]
    if streaming:
        command += ["-vf", "select='not(between(t,1,1.6))'", "-fps_mode", "vfr",
                    "-live", "1", "-cluster_time_limit", "100"]
    subprocess.run([*command, str(path)], check=True)
    assert_tracks(path, audio, name)
    return path


def assert_tracks(path, audio, stage):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name",
         "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    tracks = json.loads(result.stdout)["streams"]
    expected = {"video", "audio"} if audio else {"video"}
    assert {track["codec_type"] for track in tracks} == expected, (stage, expected, tracks)
    return tracks


def inspect_download(download, audio=False, stage="recording"):
    path = download.path()
    extension = pathlib.Path(download.suggested_filename).suffix.lower()
    assert extension in {".mp4", ".webm"}, extension
    with path.open("rb") as stream:
        header = stream.read(12)
    assert header[4:8] == b"ftyp" if extension == ".mp4" else header[:4] == bytes.fromhex("1a45dfa3")
    tracks = assert_tracks(path, audio, stage)
    expected_audio = "aac" if extension == ".mp4" else "opus"
    if audio:
        assert any(track == {"codec_type": "audio", "codec_name": expected_audio} for track in tracks), (stage, tracks)
    return {"container": extension[1:], "tracks": tracks}


def inspect_mp3(download):
    assert pathlib.Path(download.suggested_filename).suffix.lower() == ".mp3"
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name",
         "-of", "json", str(download.path())],
        check=True, capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    assert data["format"]["format_name"] == "mp3", data
    assert data["streams"] == [{"codec_name": "mp3", "codec_type": "audio"}], data
    assert abs(float(data["format"]["duration"]) - 3) < 0.25, data
    return data
