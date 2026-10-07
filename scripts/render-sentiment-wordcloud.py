"""Three separate frequency clouds from model-classified local comments."""
import json, re, sys
from pathlib import Path
from collections import Counter
from wordcloud import WordCloud, STOPWORDS
from PIL import Image, ImageDraw, ImageFont
source=Path(sys.argv[1]).resolve()
data=json.loads(source.read_text(encoding='utf-8'))
out=source.with_name('wordcloud-sentiment.png')
freqout=source.with_name('word-frequencies-sentiment.json')
if out.exists() or freqout.exists(): raise SystemExit('Refusing to overwrite existing output')
font='C:/Windows/Fonts/malgun.ttf'
stop=set(STOPWORDS)|{'im','ive','dont','didnt','isnt','cant','wont','doesnt','youre','thats','its','yeah','oh','hey','www','com'}
canvas=Image.new('RGB',(1800,960),'#faf9f6')
d=ImageDraw.Draw(canvas)
def text(x,y,s,size=24,color='#26313c'): d.text((x,y),s,font=ImageFont.truetype(font,size),fill=color)
text(50,30,'LET IT HAPPEN',42)
text(50,91,'Tame Impala · 유튜브 댓글 감성별 워드클라우드',25)
freq={}
for i,(label,name,color) in enumerate([('positive','긍정','#25587b'),('negative','부정','#a64e32'),('neutral','중립','#59616b')]):
    rows=[r for r in data['comments'] if r['label']==label]
    assert len(rows)==data['counts'][label]
    counts=Counter()
    for r in rows:
        cleaned=re.sub(r'https?://\S+|@\w+',' ',r['text'].lower())
        counts.update(w for w in re.findall(r"[a-z]+(?:'[a-z]+)?",cleaned) if len(w)>2 and w not in stop)
    freq[label]={'comments':len(rows),'counts':counts.most_common()}
    x=50+i*580
    text(x,167,f'{name} · {len(rows)}개',31,color)
    if counts:
        cloud=WordCloud(font_path='C:/Windows/Fonts/arial.ttf',width=540,height=480,background_color='#faf9f6',max_words=45,max_font_size=80,min_font_size=13,prefer_horizontal=1,relative_scaling=.5,random_state=42,collocations=False,color_func=lambda *a,c=color,**kw:c).generate_from_frequencies(counts)
        canvas.paste(cloud.to_image(),(x,226))
    else:text(x,340,'해당 댓글 없음',26)
    if i<2:d.line((x+557,167,x+557,714),fill='#d5d5d5',width=1)
notes=[f"총 {len(data['comments'])}개 · 미분석 {data['counts']['unanalysed']}개(긴 글 제외, 중립에 포함하지 않음)",
       '분류: 긍정·부정·중립 모델 확률 중 최댓값. 문장 감정이며 곡에 대한 평가와는 다를 수 있습니다.',
       '단어 크기는 각 그룹 안의 등장 빈도입니다. 그룹 사이 글자 크기는 직접 비교할 수 없습니다.',
       '자동 분류는 반어·밈을 오해할 수 있습니다. 관련도순 50개 예시이며 전체 청취자를 대표하지 않습니다.',
       data['video']['url']+' · '+data['collectedAt'][:10]]
for i,n in enumerate(notes):text(50,755+i*34,n,20,'#59616b')
canvas.save(out)
with freqout.open('x',encoding='utf-8') as f:json.dump(freq,f,ensure_ascii=False,indent=2)
print(json.dumps({'image':str(out),'counts':data['counts']}))
