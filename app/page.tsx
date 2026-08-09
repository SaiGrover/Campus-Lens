"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  GitBranch,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  MapPin,
  Menu,
  MessageSquareWarning,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, lazy, Suspense, useMemo, useRef, useState } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

type View = "overview" | "explore" | "models" | "rules";

const navItems: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "explore", label: "Issue explorer", icon: Search },
  { id: "models", label: "Model lab", icon: BrainCircuit },
  { id: "rules", label: "Pattern rules", icon: GitBranch },
];

const heatmap = [
  { place: "ABB", values: [1, 2, 4, 3, 2, 1] },
  { place: "CL3", values: [2, 4, 5, 3, 1, 1] },
  { place: "G2", values: [1, 1, 2, 2, 1, 1] },
  { place: "Canteen", values: [1, 2, 5, 4, 3, 2] },
  { place: "CS Lab", values: [1, 3, 4, 4, 2, 1] },
];

const issues = [
  { name: "Wi-Fi connectivity", count: 124, pct: 31, tone: "green", icon: Wifi },
  { name: "Infrastructure", count: 92, pct: 23, tone: "orange", icon: Building2 },
  { name: "Canteen & queues", count: 68, pct: 17, tone: "yellow", icon: Users },
  { name: "Lab equipment", count: 52, pct: 13, tone: "blue", icon: Zap },
  { name: "Cleanliness", count: 40, pct: 10, tone: "purple", icon: Sparkles },
];

const feed = [
  { category: "Network", location: "CL3 · Floor 2", time: "11 min ago", rating: 2, text: "Wi-Fi drops every few minutes during the 10 AM lecture block.", status: "Recurring", tone: "green" },
  { category: "Infrastructure", location: "ABB · Room 204", time: "28 min ago", rating: 1, text: "Projector turns off after ten minutes and the HDMI port is loose.", status: "Emerging", tone: "orange" },
  { category: "Canteen", location: "Main canteen", time: "43 min ago", rating: 2, text: "Queue has reached the stairwell again. Only one billing counter is open.", status: "Peak hour", tone: "yellow" },
];

const modelRows = [
  { name: "SVM", accuracy: 91.8, precision: 91.2, recall: 90.6, f1: 90.9, best: true },
  { name: "Naïve Bayes", accuracy: 87.4, precision: 86.8, recall: 85.9, f1: 86.3 },
  { name: "kNN", accuracy: 84.6, precision: 83.5, recall: 84.1, f1: 83.8 },
  { name: "ID3", accuracy: 81.9, precision: 80.7, recall: 81.4, f1: 81.0 },
];

const rules = [
  { when: ["ABB", "10 AM–12 PM", "Monday"], then: "Wi-Fi complaint", support: "18.4%", confidence: "82%", lift: "2.7×", strength: 91 },
  { when: ["Main canteen", "1 PM–2 PM", "Wednesday"], then: "Queue · High", support: "15.1%", confidence: "88%", lift: "3.1×", strength: 96 },
  { when: ["Computer lab", "Afternoon", "High occupancy"], then: "System failure", support: "11.7%", confidence: "74%", lift: "2.4×", strength: 82 },
  { when: ["CL3", "Humidity > 70%", "Floor 2"], then: "AC complaint", support: "8.9%", confidence: "69%", lift: "2.1×", strength: 75 },
];

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><span /><span /><span /><span /></span>;
}

function Landing({ onEnter, onReport }: { onEnter: () => void; onReport: () => void }) {
  return (
    <div className="landing-page">
      <nav className="landing-nav" aria-label="Landing page navigation">
        <button className="landing-brand" onClick={onEnter} aria-label="Open CampusLens dashboard"><LogoMark /><span><b>CAMPUS</b>LENS</span></button>
        <div className="landing-links">
          <a href="#platform">Platform</a><a href="#intelligence">Intelligence</a><a href="#method">Method</a><a href="#impact">Impact</a>
        </div>
        <button className="landing-nav-cta" onClick={onReport}>Report friction <ArrowUpRight size={15}/></button>
      </nav>
      <section className="landing-hero" id="platform">
        <div className="spline-layer" aria-hidden="true">
          <Suspense fallback={<div className="spline-fallback" />}>
            <Spline scene="https://prod.spline.design/Slk6b8kz3LRlKiyk/scene.splinecode" />
          </Suspense>
        </div>
        <div className="landing-overlay" />
        <div className="landing-grid" aria-hidden="true" />
        <div className="landing-signal"><i/> Campus pulse live <span>·</span> 398 reports analysed</div>
        <div className="landing-content">
          <p className="landing-kicker landing-animate d1">Campus Friction Intelligence</p>
          <h1 className="landing-animate d2">CAMPUS<span>LENS</span></h1>
          <h2 className="landing-animate d3">See the friction. Fix the campus.</h2>
          <p className="landing-description landing-animate d4">A decision-support system that reveals what students repeatedly face, where it happens, when it peaks, and which conditions move together.</p>
          <div className="landing-actions landing-animate d5">
            <button className="hero-primary" onClick={onEnter}>Open intelligence <ArrowUpRight size={18}/></button>
            <button className="hero-secondary" onClick={onReport}>Report an issue</button>
          </div>
          <p className="landing-trust landing-animate d6">5 hotspots active <i/> 24 strong pattern rules <i/> 91.8% classifier accuracy</p>
        </div>
        <div className="landing-index" aria-hidden="true"><span>01</span><i/><span>Campus intelligence</span></div>
      </section>
    </div>
  );
}

function ReportModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const [step, setStep] = useState(1);
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 2) return setStep(2);
    onSubmitted();
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <header className="modal-header">
          <div>
            <span className="eyebrow">Anonymous campus report</span>
            <h2 id="report-title">What’s getting in your way?</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close report form"><X size={20} /></button>
        </header>
        <div className="stepper" aria-label={`Step ${step} of 2`}>
          <span className="active"><b>1</b> Describe</span><i /><span className={step === 2 ? "active" : ""}><b>2</b> Details</span>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <div className="form-body">
              <label className="field full"><span>Complaint</span><textarea required placeholder="e.g. Wi-Fi becomes extremely slow near CL3 between 10 and 12." rows={5} /></label>
              <div className="quick-categories" aria-label="Suggested categories">
                {[[Wifi,"Network"],[Building2,"Infrastructure"],[Sparkles,"Cleanliness"],[Users,"Canteen"],[Zap,"Electrical"]].map(([Icon,label]) => {
                  const I = Icon as typeof Wifi;
                  return <button type="button" key={label as string}><I size={16} />{label as string}</button>;
                })}
              </div>
              <button className="primary-button wide" type="submit">Continue <ChevronRight size={17} /></button>
              <p className="privacy-note"><ShieldCheck size={15} /> No name, roll number, or email is collected.</p>
            </div>
          ) : (
            <div className="form-body detail-grid">
              <label className="field"><span>Location</span><div className="select-wrap"><MapPin size={16}/><select required defaultValue="CL3"><option>CL3</option><option>ABB</option><option>G2</option><option>Main canteen</option><option>CS Lab</option></select><ChevronDown size={15}/></div></label>
              <label className="field"><span>Category</span><div className="select-wrap"><Layers3 size={16}/><select required defaultValue="Network"><option>Network</option><option>Infrastructure</option><option>Cleanliness</option><option>Canteen</option><option>Electrical</option><option>Lab equipment</option><option>Other</option></select><ChevronDown size={15}/></div></label>
              <fieldset className="field full rating-field"><legend>How disruptive is it?</legend><div>{[1,2,3,4,5].map(n => <label key={n}><input type="radio" name="rating" value={n} defaultChecked={n===2}/><span>{n}</span></label>)}</div><small>Severe <span>Minor</span></small></fieldset>
              <div className="field full"><span>Optional image</span><input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f=e.target.files?.[0]; if(f) setImage(URL.createObjectURL(f)); }} />
                <button type="button" className="upload-zone" onClick={() => fileRef.current?.click()}>
                  {image ? <><img src={image} alt="Selected complaint evidence"/><span><Check size={17}/> Image ready</span></> : <><span className="upload-icon"><Camera size={21}/></span><b>Add a photo</b><small>Equipment, classroom, or affected area · max 8 MB</small></>}
                </button>
              </div>
              <div className="form-actions full"><button type="button" className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" type="submit">Submit anonymously <Upload size={16}/></button></div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

function Overview() {
  return (
    <>
      <section className="hero-grid">
        <article className="health-card">
          <div className="card-heading"><div><span className="eyebrow light">Campus health score</span><p>Live operational pulse</p></div><span className="live-pill"><i/> Live</span></div>
          <div className="score-wrap"><strong>76</strong><span>/ 100</span><div className="score-ring" aria-label="76 out of 100"><i /></div></div>
          <div className="score-footer"><span><ArrowUpRight size={15}/> 4 pts this month</span><p>Good, with 3 hotspots</p></div>
        </article>
        <article className="metric-card accent-lime"><div className="metric-icon"><Wifi size={20}/></div><span>Top recurring issue</span><strong>Wi-Fi connectivity</strong><div className="metric-bottom"><b>31%</b><p>of all reports</p></div></article>
        <article className="metric-card"><div className="metric-icon coral"><MapPin size={20}/></div><span>Most affected location</span><strong>CL3</strong><div className="metric-bottom"><b>86</b><p>reports this month</p></div></article>
        <article className="metric-card"><div className="metric-icon amber"><Clock3 size={20}/></div><span>Peak problem period</span><strong>10:00–12:00</strong><div className="metric-bottom"><b>27%</b><p>of daily friction</p></div></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel heatmap-panel">
          <div className="panel-head"><div><span className="eyebrow">Campus issue heatmap</span><h2>Where friction accumulates</h2></div><button className="text-button">Full analysis <ChevronRight size={15}/></button></div>
          <div className="heatmap-wrap">
            <div className="heatmap-head"><span>Location</span>{["8 AM","10 AM","12 PM","2 PM","4 PM","6 PM"].map(t=><span key={t}>{t}</span>)}</div>
            {heatmap.map(row => <div className="heatmap-row" key={row.place}><b>{row.place}</b>{row.values.map((v,i)=><button aria-label={`${row.place} at ${[8,10,12,2,4,6][i]}: intensity ${v}`} className={`heat v${v}`} key={i}><span>{v>=4 ? v*7 : ""}</span></button>)}</div>)}
          </div>
          <div className="heat-legend"><span>Low</span>{[1,2,3,4,5].map(n=><i className={`v${n}`} key={n}/>)}<span>Critical</span><p><CircleDot size={14}/> 398 reports · last 30 days</p></div>
        </article>
        <article className="panel issue-panel">
          <div className="panel-head"><div><span className="eyebrow">Issue mix</span><h2>What students face</h2></div><button className="icon-button" aria-label="Filter issue mix"><Filter size={17}/></button></div>
          <div className="issue-list">{issues.map(({name,count,pct,tone,icon:Icon})=><div className="issue-row" key={name}><span className={`issue-icon ${tone}`}><Icon size={16}/></span><div><b>{name}</b><span>{count} reports</span></div><strong>{pct}%</strong><i><span className={tone} style={{width:`${pct*2.6}%`}}/></i></div>)}</div>
          <button className="panel-action">Explore all categories <ChevronRight size={16}/></button>
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel trend-panel">
          <div className="panel-head"><div><span className="eyebrow">Emerging signal</span><h2>Projector failures are climbing</h2></div><span className="trend-badge"><TrendingUp size={15}/> 23%</span></div>
          <div className="trend-chart" aria-label="Projector failure trend from week 1 to week 6">
            {[31,38,35,46,61,77].map((h,i)=><div key={i}><span style={{height:`${h}%`}} className={i===5?"last":""}/><small>W{i+1}</small></div>)}
          </div>
          <p className="insight"><Lightbulb size={17}/><span><b>Pattern detected:</b> 72% of reports originate from ABB floor 2 after 1 PM.</span></p>
        </article>
        <article className="panel feed-panel">
          <div className="panel-head"><div><span className="eyebrow">Live stream</span><h2>Recent student reports</h2></div><button className="text-button">View all</button></div>
          <div className="feed-list">{feed.map((item,i)=><div className="feed-item" key={i}><span className={`feed-dot ${item.tone}`}/><div><div className="feed-meta"><b>{item.category}</b><span>·</span><span>{item.location}</span><span>·</span><span>{item.time}</span></div><p>{item.text}</p><div><span className="status-pill">{item.status}</span><span className="rating">Impact {item.rating}/5</span></div></div></div>)}</div>
        </article>
      </section>
    </>
  );
}

function Explore() {
  const [query,setQuery] = useState("");
  const filtered = useMemo(()=>feed.filter(x => `${x.category} ${x.location} ${x.text}`.toLowerCase().includes(query.toLowerCase())),[query]);
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Multidimensional analysis</span><h1>Drill from building to root cause.</h1><p>Slice 398 campus reports by place, time, category, severity, and issue—then follow the patterns down to the room.</p></div>
    <div className="explore-toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search reports, rooms, or issues"/></label>{["All buildings","Last 30 days","All categories"].map(x=><button key={x}>{x}<ChevronDown size={15}/></button>)}</div>
    <div className="drill-path"><span>Campus</span><ChevronRight size={15}/><span>CL3</span><ChevronRight size={15}/><span>Floor 2</span><ChevronRight size={15}/><b>Network</b></div>
    <div className="explorer-grid"><article className="panel location-rank"><div className="panel-head"><div><span className="eyebrow">Hotspot ranking</span><h2>Complaints by location</h2></div></div>{[["CL3",86,92],["ABB",74,79],["Main canteen",63,67],["CS Lab",49,52],["G2",31,33]].map(([n,c,w],i)=><div className="rank-row" key={n as string}><span>0{i+1}</span><div><b>{n}</b><i><span style={{width:`${w}%`}}/></i></div><strong>{c}</strong></div>)}</article>
      <article className="panel complaint-table"><div className="panel-head"><div><span className="eyebrow">Matching reports</span><h2>{filtered.length} reports in view</h2></div><button className="secondary-button">Export CSV</button></div>{filtered.map((item,i)=><div className="table-report" key={i}><span className={`feed-dot ${item.tone}`}/><div><b>{item.category}</b><p>{item.text}</p><small><MapPin size={13}/>{item.location}<Clock3 size={13}/>{item.time}</small></div><span className="status-pill">{item.status}</span></div>)}</article></div>
  </section>;
}

function Models() {
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Complaint classification</span><h1>Four models. One honest comparison.</h1><p>TF-IDF features on 2,840 labelled complaints across seven issue categories. The same test split is used for every model.</p></div>
    <div className="model-summary"><article className="winner-card"><span><Target size={18}/> Recommended model</span><h2>Support Vector Machine</h2><strong>91.8<small>% accuracy</small></strong><p>Best balance of category recall and precision, especially for Network and Infrastructure.</p></article><article className="pipeline-card"><span className="eyebrow">Text pipeline</span><div><span>Raw complaint</span><ChevronRight/><span>Clean + tokenize</span><ChevronRight/><span>TF-IDF</span><ChevronRight/><span>Classify</span></div><code>“wifi slow near cl3” → [0.23, 0.00, 0.81, …]</code></article></div>
    <article className="panel model-table"><div className="panel-head"><div><span className="eyebrow">Benchmark</span><h2>Performance comparison</h2></div><span className="dataset-pill">Test set · n=568</span></div><div className="table-scroll"><table><thead><tr><th>Algorithm</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1 score</th><th>Result</th></tr></thead><tbody>{modelRows.map(m=><tr key={m.name} className={m.best?"best":""}><td><span className="model-symbol">{m.name[0]}</span><b>{m.name}</b></td>{[m.accuracy,m.precision,m.recall,m.f1].map((n,i)=><td key={i}><strong>{n}%</strong><i><span style={{width:`${n}%`}}/></i></td>)}<td>{m.best?<span className="winner-pill"><Check size={14}/> Best</span>:<span className="muted">Compared</span>}</td></tr>)}</tbody></table></div></article>
    <div className="confusion-grid"><article className="panel"><div className="panel-head"><div><span className="eyebrow">SVM confusion matrix</span><h2>Where the model gets confused</h2></div></div><div className="matrix"><span/><b>Net</b><b>Infra</b><b>Clean</b><b>Food</b>{[[94,3,1,2],[4,88,5,3],[1,6,91,2],[2,2,4,92]].flatMap((v,i)=> i%4===0 ? [<b key={`l${i}`}>{["Net","Infra","Clean","Food"][i/4]}</b>,<span className="diag" key={i}>{v}</span>] : [<span key={i}>{v}</span>])}</div></article><article className="panel weka-card"><div><span className="eyebrow">WEKA validation</span><h2>Reproducible outside the app</h2><p>The exported ARFF dataset reproduces the Naïve Bayes benchmark in WEKA 3.8.</p></div><button className="secondary-button"><Upload size={15}/> Download .ARFF</button></article></div>
  </section>;
}

function Rules() {
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Association-rule mining</span><h1>Find conditions that travel together.</h1><p>Apriori rules surface combinations of place, time, day, occupancy, and environment that reliably precede a campus issue.</p></div>
    <div className="rule-stats"><article><GitBranch/><span>Strong rules</span><strong>24</strong><small>lift ≥ 2.0</small></article><article><Target/><span>Highest confidence</span><strong>88%</strong><small>canteen queue</small></article><article><Network/><span>Mean lift</span><strong>2.4×</strong><small>across filtered rules</small></article></div>
    <article className="panel rules-panel"><div className="panel-head"><div><span className="eyebrow">Discovered associations</span><h2>Strongest campus patterns</h2></div><button className="secondary-button"><Filter size={15}/> min lift 2.0</button></div><div className="rules-list">{rules.map((r,i)=><div className="rule-row" key={i}><div className="rule-number">{String(i+1).padStart(2,"0")}</div><div className="rule-logic"><div>{r.when.map(x=><span key={x}>{x}</span>)}</div><ArrowDownRight size={20}/><strong>{r.then}</strong></div><div className="rule-metrics"><span><small>Support</small><b>{r.support}</b></span><span><small>Confidence</small><b>{r.confidence}</b></span><span><small>Lift</small><b>{r.lift}</b></span><i><span style={{width:`${r.strength}%`}}/></i></div></div>)}</div></article>
    <p className="r-note"><span>R</span><b>Apriori run complete</b> · 398 transactions · minimum support 8% · minimum confidence 65%</p>
  </section>;
}

export default function Home() {
  const [launched,setLaunched] = useState(false);
  const [view,setView] = useState<View>("overview");
  const [reportOpen,setReportOpen] = useState(false);
  const [toast,setToast] = useState(false);
  const [mobileNav,setMobileNav] = useState(false);
  const titles: Record<View,[string,string]> = { overview:["Campus pulse","Here’s what’s happening across campus today."], explore:["Issue explorer","Slice, filter, and drill into reported friction."], models:["Model lab","Compare how each classifier performs."], rules:["Pattern rules","Discover the conditions behind recurring issues."] };
  function submitted(){setToast(true);setTimeout(()=>setToast(false),4000)}
  if (!launched) return <><Landing onEnter={()=>setLaunched(true)} onReport={()=>setReportOpen(true)}/>{reportOpen&&<ReportModal onClose={()=>setReportOpen(false)} onSubmitted={submitted}/>} {toast&&<div className="toast"><span><Check size={17}/></span><div><b>Report received</b><p>Thanks for helping reveal campus friction.</p></div><button onClick={()=>setToast(false)} aria-label="Dismiss"><X size={16}/></button></div>}</>;
  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav?"open":""}`}>
      <div className="brand"><LogoMark/><span><b>Campus</b>Lens</span></div>
      <p className="sidebar-label">Intelligence</p>
      <nav>{navItems.map(({id,label,icon:Icon})=><button key={id} className={view===id?"active":""} onClick={()=>{setView(id);setMobileNav(false)}}><Icon size={18}/><span>{label}</span>{view===id&&<i/>}</button>)}</nav>
      <div className="sidebar-spacer"/>
      <div className="signal-card"><span><Activity size={16}/> System pulse</span><strong>398</strong><p>reports analysed</p><div><i/><i/><i/><i/><i/></div><small>Updated 4 min ago</small></div>
      <button className="sidebar-help"><MessageSquareWarning size={17}/> Data methodology</button>
      <div className="campus-select"><span className="avatar">CU</span><div><b>City University</b><small>Main campus</small></div><ChevronDown size={15}/></div>
    </aside>
    {mobileNav&&<button className="nav-scrim" aria-label="Close navigation" onClick={()=>setMobileNav(false)}/>} 
    <section className="main-content">
      <header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu/></button><div><span className="eyebrow">{titles[view][0]}</span><h1>{titles[view][1]}</h1></div></div><div className="top-actions"><button className="date-button"><CalendarDays size={16}/> Last 30 days <ChevronDown size={15}/></button><button className="icon-button bell" aria-label="Notifications"><Bell size={18}/><i/></button><button className="primary-button" onClick={()=>setReportOpen(true)}><Plus size={18}/> Report an issue</button></div></header>
      <div className="content-wrap">{view==="overview"?<Overview/>:view==="explore"?<Explore/>:view==="models"?<Models/>:<Rules/>}</div>
    </section>
    {reportOpen&&<ReportModal onClose={()=>setReportOpen(false)} onSubmitted={submitted}/>} 
    {toast&&<div className="toast"><span><Check size={17}/></span><div><b>Report received</b><p>Thanks for helping reveal campus friction.</p></div><button onClick={()=>setToast(false)} aria-label="Dismiss"><X size={16}/></button></div>}
  </main>;
}
