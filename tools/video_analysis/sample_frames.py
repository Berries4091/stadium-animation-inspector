#!/usr/bin/env python3
"""Sample frames from a user-provided local video and produce a contact sheet."""
import argparse, json, subprocess
from pathlib import Path
from PIL import Image, ImageDraw

def probe(path):
    p=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","json",str(path)],capture_output=True,text=True,check=True)
    return float(json.loads(p.stdout)["format"]["duration"])

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video",type=Path)
    ap.add_argument("--out",type=Path,default=Path("video-report"))
    ap.add_argument("--interval",type=float,default=30)
    args=ap.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    duration=probe(args.video)
    frames=[]
    for i,t in enumerate(range(0,int(duration)+1,max(1,int(args.interval)))):
        dest=args.out/f"frame_{i:04d}.jpg"
        result=subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-ss",str(t),"-i",str(args.video),"-frames:v","1","-y",str(dest)],capture_output=True,text=True)
        if result.returncode==0 and dest.exists(): frames.append({"seconds":t,"file":dest.name})
    thumb_w,thumb_h=320,200
    sheet=Image.new("RGB",(thumb_w*4,thumb_h*((len(frames)+3)//4)),"white")
    draw=ImageDraw.Draw(sheet)
    for i,frame in enumerate(frames):
        with Image.open(args.out/frame["file"]) as im:
            im.thumbnail((thumb_w,thumb_h-25))
            x=(i%4)*thumb_w;y=(i//4)*thumb_h
            sheet.paste(im,(x,y+25))
            draw.text((x+5,y+5),f'{frame["seconds"]} seconds',fill="black")
    if frames: sheet.save(args.out/"contact_sheet.jpg")
    (args.out/"manifest.json").write_text(json.dumps({"duration_seconds":duration,"frames":frames},indent=2))
    print(f"Saved {len(frames)} frames to {args.out}")
if __name__=="__main__": main()
