from pathlib import Path
import sys, json, math, statistics, copy
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT/'ga-web')]
import ga_ackley as ga
from engine import GAEngine, build_config
OUT = ROOT/'presentation'/'data'
OUT.mkdir(parents=True, exist_ok=True)
cfg = build_config({})
eng = GAEngine(cfg)
initial = eng.snapshot()
generations = []
while not eng.finished:
    generations.append(eng.step_generation())
final = eng.snapshot()
cli = ga.run_ga(cfg, False)
assert final['history_best'] == cli['history_best']
assert final['history_average'] == cli['history_average']
experiments = []
for label, overrides in [('Baseline',{}),('Pc = 0.70',{'pc':.7}),('Pc = 0.90',{'pc':.9}),('Pm = 0.01',{'pm':.01}),('Pm = 0.10',{'pm':.1}),('Sigma = 0.10',{'mutation_sigma':.1}),('Sigma = 0.50',{'mutation_sigma':.5}),('N = 20',{'pop_size':20}),('N = 100',{'pop_size':100})]:
    runs=[]
    for seed in range(42,62):
        r=ga.run_ga(dict(cfg,**overrides,random_seed=seed),False)
        runs.append({'seed':seed,'best':r['best_value'],'generations':r['generations_run']})
    vals=[r['best'] for r in runs]
    experiments.append({'label':label,'overrides':overrides,'median':statistics.median(vals),'mean':statistics.mean(vals),'min':min(vals),'max':max(vals),'success_count':sum(v<.001 for v in vals),'runs':runs})
avg=cli['history_average']; best=cli['history_best']
spikes=sorted([{'generation':i+1,'from':avg[i-1],'to':avg[i],'delta':avg[i]-avg[i-1]} for i in range(1,len(avg))],key=lambda r:r['delta'],reverse=True)
summary={'config':cfg,'result':cli,'distance':math.dist(cli['best_chromosome'],[0,0]),'experiments':experiments,'spikes':spikes[:5],'improvements':[{'generation':i+1,'best':v} for i,v in enumerate(best) if i==0 or v<best[i-1]],'early_improvement_fraction':(best[0]-best[4])/(best[0]-best[-1])}
for name,data in [('run',{'initial':initial,'generations':generations,'final':final}),('summary',summary)]:
    (OUT/f'{name}.json').write_text(json.dumps(data,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in summary.items() if k not in ['config','result','experiments']},indent=2))
print('EXPERIMENTS',json.dumps([{k:v for k,v in e.items() if k!='runs'} for e in experiments],indent=2))
print('FIRST GENERATION',json.dumps({x['stage']:x['detail'] for x in generations[0]['stages'] if x['stage'] in ['commit','elitism']},indent=2))
