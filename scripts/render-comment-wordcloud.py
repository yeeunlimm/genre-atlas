"""Render one reproducible wordcloud from the locally collected comment example."""
import json, re, sys
from collections import Counter
from pathlib import Path
from wordcloud import WordCloud, STOPWORDS
from PIL import Image, ImageDraw, ImageFont

source = Path(sys.argv[1]).resolve()
data = json.loads(source.read_text(encoding='utf-8'))
out = source.with_name('wordcloud.png')
counts_file = source.with_name('word-frequencies.json')
if out.exists() or counts_file.exists():
    raise SystemExit('Output already exists; refusing to overwrite.')
stop = set(STOPWORDS) | {'im','ive','dont','didnt','isnt','cant','wont','doesnt','youre','thats','its','yeah','oh','hey','www','com'}
counts = Counter()
for row in data['comments']:
    text = re.sub(r'https?://\S+|@\w+', ' ', row['text'].lower())
    words = re.findall(r"[a-z]+(?:'[a-z]+)?", text)
    counts.update(w for w in words if len(w)>2 and w not in stop)
if not counts:
    raise SystemExit('No supported words. No placeholder wordcloud created.')
font='C:/Windows/Fonts/arial.ttf'
cloud = WordCloud(font_path=font,width=1440,height=700,background_color='#faf9f6',
    max_words=70,min_font_size=15,max_font_size=150,prefer_horizontal=1,
    random_state=42,relative_scaling=.5,collocations=False,
    color_func=lambda *args,**kwargs:'#253b52').generate_from_frequencies(counts)
canvas=Image.new('RGB',(1600,1000),'#faf9f6')
canvas.paste(cloud.to_image(),(80,170))
draw=ImageDraw.Draw(canvas)
draw.text((80,48),data['title'].upper(),font=ImageFont.truetype(font,42),fill='#19232e')
draw.text((80,106),data['artist']+' / YOUTUBE COMMENT SAMPLE',font=ImageFont.truetype(font,22),fill='#55616b')
draw.line((80,148,1520,148),fill='#c5c9cc',width=1)
notes=[f"{len(data['comments'])} comments / English word frequency / top 70 words",
       'Common words, links and numbers removed. Size reflects frequency, not sentiment.',
       data['video']['url']+' / '+data['collectedAt'][:10]]
for i,note in enumerate(notes):draw.text((80,890+i*27),note,font=ImageFont.truetype(font,18),fill='#55616b')
canvas.save(out)
with counts_file.open('x',encoding='utf-8') as f:json.dump({'source':source.name,'tokenization':'lowercase English words; stopwords/links/numbers removed; no stemming','counts':counts.most_common()},f,indent=2)
assert all(count>0 for count in counts.values())
print(json.dumps({'image':str(out),'comments':len(data['comments']),'uniqueWords':len(counts),'topWords':counts.most_common(10)}))
