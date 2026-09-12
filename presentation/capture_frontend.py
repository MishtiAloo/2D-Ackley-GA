from pathlib import Path
import json, time
from playwright.sync_api import sync_playwright
from PIL import Image

HERE=Path(__file__).resolve().parent
ASSETS=HERE/'assets'; ASSETS.mkdir(exist_ok=True)
run=json.loads((HERE/'data/run.json').read_text())
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    context=browser.new_context(viewport={'width':1600,'height':1000},device_scale_factor=2,color_scheme='light')
    page=context.new_page()
    page.add_init_script("localStorage.setItem('ga.theme','light');")
    page.goto('http://127.0.0.1:5011')
    page.wait_for_function('window.state && state.snapshot && !state.busy')
    assert page.get_attribute('html','data-theme')=='light'
    page.evaluate('state.animate=false')
    # Browser-only presentation zoom; the project files and values stay unchanged.
    page.add_style_tag(content='''
      .topbar{flex-wrap:wrap} .layout{grid-template-columns:0px 820px 740px!important}
      #side-left{visibility:hidden} .right{width:740px} #inspector{padding:12px}
      #inspector *{font-size:20px!important;line-height:1.35!important}
      #inspector h3{font-size:24px!important} .stage .scroll{max-height:none!important}
      #inspector .explain{display:none!important}
      .main .canvas-wrap:not(.chart){height:520px!important;min-height:520px!important}
      .main .canvas-wrap.chart{height:330px!important;min-height:330px!important}
      #landscape{height:500px!important;max-width:none!important;aspect-ratio:auto!important}
      #chart{height:310px!important}
      .gene{min-width:108px!important} .crow .who{width:75px!important}
      .main .card-head *{font-size:20px!important} .main .legend{font-size:20px!important}
      .stage .body{padding:16px!important}
    ''')
    # Increase canvas label size for projection, using the same frontend renderer.
    page.evaluate('''() => {
      const d=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'font');
      window.presentationFontDescriptor=d;
      Object.defineProperty(CanvasRenderingContext2D.prototype,'font',{get:d.get,set(v){d.set.call(this,v.replace(/([0-9.]+)px/,(_,n)=>Math.max(22,Number(n))+'px'))}});
      window.dispatchEvent(new Event('resize'));
    }''')
    def show(item):
        page.evaluate('''async item=>{state.snapshot=item.snapshot;updateReadouts(item.snapshot);updateStageBar(item.snapshot);Chart.setData(item.snapshot.history_best,item.snapshot.history_average);await Stages.showStage(item.stage,item.detail,item.snapshot,{animate:false,speed:0});}''',item)
        page.wait_for_timeout(100)
    def snap(selector,name):
        page.locator(selector).first.screenshot(path=str(ASSETS/name))
    # Genuine frontend panels with cropped/excerpted rows for readability.
    first=run['generations'][0]['stages']
    show(first[0])
    page.locator('[data-view="3d"]').click()
    page.add_style_tag(content='.hint{display:none!important}')
    snap('#landscape','landscape_3d.png')
    page.locator('[data-view="2d"]').click()
    snap('#landscape','initial_map.png')
    page.screenshot(path=str(ASSETS/'frontend_white_overview.png'),full_page=False)
    page.evaluate("document.querySelectorAll('#inspector .grid tr').forEach((r,i)=>{if(i>5)r.style.display='none'})")
    snap('#inspector .stage','evaluate.png')
    for item in first[1:]:
        show(item)
        stage=item['stage']
        if stage=='select':
            # Roulette tape, pool, and frequency summary are original UI content.
            page.evaluate("document.querySelectorAll('#inspector .grid').forEach(r=>r.style.display='none')")
        if stage=='crossover':
            page.evaluate("document.querySelectorAll('#inspector .pairbox').forEach((r,i)=>{if(i!==1)r.style.display='none'})")
        if stage=='mutate':
            page.evaluate("document.querySelectorAll('#inspector .mrow').forEach(r=>{if(!['5','8','23'].includes(r.dataset.child))r.style.display='none'})")
        snap('#inspector .stage',stage+'.png')
    # Same run at evaluated generations; histories and populations stay aligned.
    frames=[]
    for g in [1,2,5,10,17,30,47,67,77,100]:
        item=run['generations'][g-1]['stages'][0]
        show(item)
        page.evaluate("Landscape.setView('2d')")
        snap('#landscape',f'map_g{g:03}.png')
        frames.append(Image.open(ASSETS/f'map_g{g:03}.png').convert('RGB'))
    frames[0].save(ASSETS/'evolution.gif',save_all=True,append_images=frames[1:],duration=[1000]*9+[2200],loop=0,optimize=True)
    # Wide convergence panel: actual chart.js rendered in light mode.
    page.add_style_tag(content='.layout{grid-template-columns:0px 1120px 440px!important}.main .canvas-wrap.chart{height:280px!important;min-height:280px!important}#chart{height:260px!important}')
    # Space the existing chart labels at the larger presentation font size.
    page.evaluate('''()=>{const ctx=Chart.ctx, original=ctx.fillText.bind(ctx);ctx.fillText=(t,x,y,...a)=>{const saved=ctx.font;if(t==='average')x+=70;if(t==='100')x-=15;if(x===41){x=43;y=Math.max(18,y);presentationFontDescriptor.set.call(ctx,'18px Consolas, monospace')}if(y===19)y+=4;original(t,x,y,...a);presentationFontDescriptor.set.call(ctx,saved)}}''')
    page.evaluate("window.dispatchEvent(new Event('resize'));Chart.log=true;Chart.draw()")
    snap('.main .card:nth-child(2)','convergence_log.png')
    page.evaluate('Chart.log=false;Chart.draw()')
    snap('.main .card:nth-child(2)','convergence_linear.png')
    # Capture the exact end-of-run banner in the same frontend.
    page.evaluate('s=>{state.snapshot=s;updateReadouts(s)}',run['final'])
    snap('#banner','result_banner.png')
    # Browser raster fallbacks accompany native SVGs embedded in the deck.
    iconpage=context.new_page()
    for path in (HERE.parent/'icons').rglob('*.svg'):
        iconpage.set_content(path.read_text(encoding='utf8'))
        iconpage.locator('svg').screenshot(path=str(ASSETS/('icon_'+path.stem+'.png')),omit_background=True)
    browser.close()
print('Captured',len(list(ASSETS.glob('*.png'))),'white-mode frontend panels and icon fallbacks; evolution.gif')
