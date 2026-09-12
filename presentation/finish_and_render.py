from pathlib import Path
import json, time
import win32com.client
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'presentation'/'preview';OUT.mkdir(exist_ok=True)
app=win32com.client.Dispatch('PowerPoint.Application')
p=app.Presentations.Open(str(ROOT/'2D_Ackley_GA_Presentation.pptx'),False,False,False)
report=[]
try:
    for slide in p.Slides:
        groups={}
        for shape in slide.Shapes:
            if shape.Name.startswith('anim_'):
                groups.setdefault(shape.Name.split('_')[1],[]).append(shape)
        for key,shapes in sorted(groups.items()):
            for n,shape in enumerate(shapes):
                effect=slide.TimeLine.MainSequence.AddEffect(shape,10,0,1 if n==0 else 2)
                effect.Timing.Duration=.35
        # Audit actual PowerPoint text bounds; tiny tolerance for font metrics.
        for shape in slide.Shapes:
            if shape.HasTextFrame and shape.TextFrame.HasText:
                tf=shape.TextFrame2
                overflow_y=tf.TextRange.BoundHeight > shape.Height + 3
                overflow_x=tf.TextRange.BoundWidth > shape.Width + 3
                if overflow_x or overflow_y:
                    report.append({'slide':slide.SlideIndex,'name':shape.Name,'text':shape.TextFrame.TextRange.Text[:120],'width':shape.Width,'height':shape.Height,'bound_w':tf.TextRange.BoundWidth,'bound_h':tf.TextRange.BoundHeight})
        slide.Export(str(OUT/f'slide_{slide.SlideIndex:02d}.png'),'PNG',1600,900)
    p.Save()
    p.SaveAs(str(ROOT/'2D_Ackley_GA_Presentation.pdf'),32)
finally:
    p.Close()
(ROOT/'presentation'/'layout_audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('Exported slides and PDF. Overflow candidates:',json.dumps(report,indent=2))
