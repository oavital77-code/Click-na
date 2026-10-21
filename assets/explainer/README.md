# סרטון ההסבר של דף הנחיתה

המקור של `public/video/cleanaplus-explainer.*`.

- `voiceover.mp3`: הקריינות (ElevenLabs, eleven_v4, הקול Nimrod). הטקסט המלא נמצא גם ב-`public/video/cleanaplus-explainer.he.vtt`.
- `explainer.html`: האנימציה. כל סצנה מתוזמנת לפי ההפסקות בקריינות (`SCENES` בראש הסקריפט), והפונקציה `render(t)` מציירת את הפריים לשנייה `t`.
- `render.mjs`: מצלם כל פריים ב-Chromium ומעביר ל-ffmpeg יחד עם הקריינות.
- `fonts/`: Heebo ו-Frank Ruhl Libre (רישיון OFL), אותם גופנים של האתר.

## איך מייצרים מחדש

```bash
npm i playwright-core            # בתיקייה נפרדת
node render.mjs "$PWD/explainer.html" out.mp4 video 30 "$PWD/voiceover.mp3" /path/to/ffmpeg
# תמונות בודקות לפני רינדור מלא:
node render.mjs "$PWD/explainer.html" ./stills stills 4,10,20
# WebM לגיבוי (דפדפנים בלי H.264) ותמונת פתיחה:
ffmpeg -i out.mp4 -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -c:a libopus -b:a 64k out.webm
ffmpeg -ss 9.9 -i out.mp4 -frames:v 1 -q:v 4 poster.jpg
```

מחליפים קריינות? צריך לעדכן את `SCENES` לפי ההפסקות החדשות
(`ffmpeg -i voiceover.mp3 -af silencedetect=noise=-35dB:d=0.28 -f null -`) ואת קובץ הכתוביות.
