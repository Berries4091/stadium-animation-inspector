# Video analysis utility

This is an isolated frame-sampling tool. It does **not** modify the game or claim to understand video content automatically.

## Run on a local video

Requirements: Python 3, Pillow, FFmpeg (including ffprobe).

```bash
python -m pip install Pillow
python tools/video_analysis/sample_frames.py gameplay.mp4 --interval 30 --out video-report
```

Outputs: `manifest.json`, individual timestamped JPEGs, and `contact_sheet.jpg`.

## YouTube reference

Requested video: https://www.youtube.com/watch?v=rM-RGs2XYEc

The video has **not** been downloaded or analyzed. To process it, first obtain a video file that you are authorized to download, then run the command above. A GitHub repository connection alone does not provide access to YouTube video frames.

A contact sheet supports human visual review; gameplay mechanics still require inspection and verification.
