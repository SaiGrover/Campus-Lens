"use client";
/* eslint-disable @next/next/no-img-element -- the report form previews a local blob URL */

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
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
import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useMemo, useRef, useState } from "react";

type View = "overview" | "explore" | "models" | "rules";
type Complaint = {
  id: string;
  category: string;
  location: string;
  time: string;
  observedAt: string;
  rating: number;
  text: string;
  status: string;
  tone: string;
  image?: string;
  title?: string;
  anonymous?: boolean;
  predictedCategory?: string;
  confidence?: number;
  duplicateCount?: number;
  incidentId?: string;
  predictedRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolutionHours?: number;
};

const locationHierarchy: Record<string, string[]> = {
  "Academic & Teaching": ["Academic Block", "A2/1", "A2/2", "Aryabhatt Bhawan II", "Aryabhatt Bhawan III", "CR rooms", "CS rooms", "G rooms", "FF rooms", "TS rooms"],
  "Labs & Research": ["CL1", "CL2", "CL3", "CL15", "CL22", "CSE / IT Labs", "ECE Labs", "Biotechnology Labs", "AICTE IDEA Lab", "Innovation Hub", "5G Use Case Lab", "R&D Centres"],
  "Library & Study": ["Learning Resource Centre (LRC)", "Reading area", "Digital resource area", "Group study area"],
  "Administration": ["Administration Block", "Registrar Office", "Academic Office", "Admission Cell", "Accounts Office", "Examination Cell", "Training & Placement Cell", "Faculty Offices"],
  "Food": ["Annapurna / Main Mess", "Cafeteria / Canteen"],
  "Hostels": ["H4 Boys Hostel", "H5 Boys Hostel", "Girls Hostel", "Hostel common rooms", "Hostel washrooms", "Hostel entrances"],
  "Sports & Recreation": ["Basketball Court", "Lawn Tennis Court", "Badminton facilities", "Volleyball Court", "Football area", "Swimming Pool", "Squash Courts", "Table Tennis area", "Boys Gym", "Girls Gym"],
  "General & Utilities": ["Auditorium", "Seminar Hall", "First Aid Centre", "Main Gate", "Parking", "Water cooler", "Washrooms", "Staircases", "Lifts", "Corridors", "Wi-Fi infrastructure point"],
};

function classifyComplaint(text: string) {
  const value = text.toLowerCase();
  if (/wifi|wi-fi|internet|network/.test(value)) return { category: "Network", confidence: 93 };
  if (/projector|chair|desk|door|wall|classroom/.test(value)) return { category: "Infrastructure", confidence: 89 };
  if (/canteen|queue|food|mess/.test(value)) return { category: "Canteen", confidence: 92 };
  if (/computer|system|monitor|keyboard|lab/.test(value)) return { category: "Lab equipment", confidence: 88 };
  if (/fan|ac|electric|light|power/.test(value)) return { category: "Electrical", confidence: 90 };
  if (/dirty|clean|washroom|garbage|spill/.test(value)) return { category: "Cleanliness", confidence: 87 };
  if (/water|leak|cooler/.test(value)) return { category: "Water", confidence: 91 };
  return { category: "Other", confidence: 68 };
}

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

const seedComplaints: Complaint[] = [
  { id: "CL-1048", category: "Network", location: "CL3 · Floor 2", time: "11 min ago", observedAt: "2026-08-10T10:32:00+05:30", rating: 2, text: "Wi-Fi drops every few minutes during the 10 AM lecture block.", status: "Recurring", tone: "green", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=75" },
  { id: "CL-1047", category: "Infrastructure", location: "ABB · Room 204", time: "28 min ago", observedAt: "2026-08-10T10:15:00+05:30", rating: 1, text: "Projector turns off after ten minutes and the HDMI port is loose.", status: "Emerging", tone: "orange", image: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=900&q=75" },
  { id: "CL-1046", category: "Canteen", location: "Main canteen", time: "43 min ago", observedAt: "2026-08-10T13:07:00+05:30", rating: 2, text: "Queue has reached the stairwell again. Only one billing counter is open.", status: "Peak hour", tone: "yellow", image: "https://images.unsplash.com/photo-1567521464027-f127ff144326?auto=format&fit=crop&w=900&q=75" },
  { id: "CL-1045", category: "Lab equipment", location: "CS Lab · Bay 12", time: "1 hr ago", observedAt: "2026-08-10T14:10:00+05:30", rating: 1, text: "Three systems freeze during compilation and one monitor has no signal.", status: "Recurring", tone: "blue", image: "https://images.unsplash.com/photo-1516321165247-4aa89a48be28?auto=format&fit=crop&w=900&q=75" },
  { id: "CL-1044", category: "Electrical", location: "G2 · Room 108", time: "2 hrs ago", observedAt: "2026-08-10T09:04:00+05:30", rating: 2, text: "Two ceiling fans are not working and the room becomes unusable after noon.", status: "Open", tone: "purple", image: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=75" },
  { id: "CL-1043", category: "Cleanliness", location: "ABB · Ground floor", time: "3 hrs ago", observedAt: "2026-08-10T08:22:00+05:30", rating: 3, text: "Water is pooling near the washroom entrance and the floor is slippery.", status: "Open", tone: "purple" },
  { id: "CL-1042", category: "Infrastructure", location: "CL3 · Room 301", time: "Yesterday", observedAt: "2026-08-09T15:45:00+05:30", rating: 2, text: "Four chairs have broken writing pads and block the back aisle.", status: "Verified", tone: "orange", image: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=900&q=75" },
  { id: "CL-1041", category: "Water", location: "Sports block", time: "Yesterday", observedAt: "2026-08-09T12:20:00+05:30", rating: 1, text: "The drinking-water station has been empty since the morning practice session.", status: "Escalated", tone: "blue" },
];

function downloadText(filename: string, contents: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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

const ease = [0.22, 1, 0.36, 1] as const;
const fadeDown = {
  hidden: { opacity: 0, y: -20 },
  visible: (index: number) => ({ opacity: 1, y: 0, transition: { delay: index * 0.1, duration: 0.5, ease } }),
};
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (index: number) => ({ opacity: 1, y: 0, transition: { delay: index * 0.12, duration: 0.6, ease } }),
};

function Landing({ onEnter, onReport, onNavigate }: { onEnter: () => void; onReport: () => void; onNavigate: (view: View) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links: { label: string; view: View }[] = [
    { label: "Signals", view: "overview" },
    { label: "Explore", view: "explore" },
    { label: "Models", view: "models" },
    { label: "Rules", view: "rules" },
  ];
  const navigate = (view: View) => { setMenuOpen(false); onNavigate(view); };

  return (
    <div className="landing-page">
      <nav className="landing-nav" aria-label="Landing page navigation">
        <motion.button custom={0} initial="hidden" animate="visible" variants={fadeDown} className="landing-brand" onClick={onEnter} aria-label="Open CampusLens dashboard">
          <span className="orbit-logo"><i /></span><span><b>CAMPUS</b>LENS</span>
        </motion.button>
        <div className="landing-links">
          {links.map((link, index) => <motion.button custom={index + 1} initial="hidden" animate="visible" variants={fadeDown} key={link.view} onClick={() => navigate(link.view)}>{link.label}</motion.button>)}
        </div>
        <motion.button custom={5} initial="hidden" animate="visible" variants={fadeDown} className="landing-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><span/><span/><span/></motion.button>
      </nav>

      <section className="landing-hero">
        <video className="landing-video" autoPlay loop muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260517_222138_3e3205be-3364-417b-a64a-bfe087acbec4.mp4" type="video/mp4" />
        </video>
        <div className="landing-video-overlay" />

        <div className="landing-stats" aria-label="CampusLens statistics">
          {[["398", "CAMPUS\nREPORTS"], ["24", "STRONG\nRULES"], ["91.8", "MODEL\nACCURACY"]].map(([value, label], index) => (
            <motion.div custom={index + 2} initial="hidden" animate="visible" variants={fadeUp} className="landing-stat" key={label}>
              <strong><span>+</span>{value}{value === "91.8" && <small>%</small>}</strong><p>{label}</p>
            </motion.div>
          ))}
        </div>

        <div className="landing-bottom">
          <div className="landing-bottom-a">
            <motion.p custom={5} initial="hidden" animate="visible" variants={fadeUp}>Turning Everyday<br/>Friction Into<br/>Campus-Wide Action</motion.p>
            <motion.button custom={6} initial="hidden" animate="visible" variants={fadeUp} onClick={onReport}>Report friction <ArrowUpRight size={22}/></motion.button>
          </div>
          <div className="landing-bottom-b">
            <motion.p custom={7} initial="hidden" animate="visible" variants={fadeUp}>A campus intelligence system built to reveal the problems students live with.</motion.p>
            <div className="landing-headline" aria-label="Hidden friction revealed">
              {["Hidden", "Friction", "Revealed"].map((word, index) => <span key={word}><motion.b initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ delay: 0.4 + index * 0.14, duration: 0.7, ease }}>{word}</motion.b></span>)}
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {menuOpen && <motion.div className="landing-menu-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }}>
          <div className="landing-menu-top"><span className="landing-brand"><span className="orbit-logo"><i/></span><span><b>CAMPUS</b>LENS</span></span><button className="landing-menu-button close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
          <div className="landing-menu-links">{links.map((link, index) => <motion.button key={link.view} onClick={() => navigate(link.view)} initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{delay:.08 + index*.07,ease}}>{link.label}</motion.button>)}</div>
          <button className="landing-menu-report" onClick={onReport}>Report friction <ArrowUpRight size={22}/></button>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}

function ReportModal({ onClose, onSubmitted, complaints }: { onClose: () => void; onSubmitted: (complaint: Complaint) => void; complaints: Complaint[] }) {
  const [step, setStep] = useState(1);
  const [image, setImage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationGroup, setLocationGroup] = useState("Labs & Research");
  const [location, setLocation] = useState("CL3");
  const [room, setRoom] = useState("");
  const [category, setCategory] = useState("Network");
  const [rating, setRating] = useState(2);
  const [anonymous, setAnonymous] = useState(true);
  const [reporterName, setReporterName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 2) {
      setCategory(classifyComplaint(`${title} ${description}`).category);
      return setStep(2);
    }
    const toneMap: Record<string, string> = { Network: "green", Infrastructure: "orange", Canteen: "yellow", Electrical: "purple", Cleanliness: "purple", "Lab equipment": "blue", Water: "blue" };
    const prediction = classifyComplaint(`${title} ${description}`);
    const duplicateCount = complaints.filter(item=>item.category===prediction.category && item.location.toLowerCase().includes(location.toLowerCase())).length;
    const predictedRisk = duplicateCount >= 3 || rating === 1 ? "CRITICAL" : duplicateCount >= 2 || rating === 2 ? "HIGH" : rating === 3 ? "MEDIUM" : "LOW";
    onSubmitted({
      id: `CL-${Date.now().toString().slice(-4)}`,
      title,
      category: prediction.category,
      location: `${location}${room.trim() ? ` · ${room.trim()}` : ""}`,
      time: "Just now",
      observedAt: new Date().toISOString(),
      rating,
      text: description,
      status: "New",
      tone: toneMap[prediction.category] ?? "blue",
      image: image ?? undefined,
      anonymous,
      predictedCategory: prediction.category,
      confidence: prediction.confidence,
      duplicateCount,
      incidentId: duplicateCount ? `INC-${prediction.category.slice(0,3).toUpperCase()}-${73 + duplicateCount}` : undefined,
      predictedRisk,
      resolutionHours: Number((1.2 + rating * .65 + duplicateCount * .4).toFixed(1)),
    });
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
              <label className="field full"><span>Issue title</span><input className="text-input" required value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="e.g. CL3 Wi-Fi outage" /></label>
              <label className="field full"><span>Complaint</span><textarea required value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="e.g. Wi-Fi becomes extremely slow near CL3 between 10 and 12." rows={4} /></label>
              <div className="identity-row full"><button type="button" className={anonymous?"active":""} onClick={()=>setAnonymous(true)}>Anonymous</button><button type="button" className={!anonymous?"active":""} onClick={()=>setAnonymous(false)}>Named</button>{!anonymous&&<input className="text-input" value={reporterName} onChange={e=>setReporterName(e.target.value)} placeholder="Your name" required/>}</div>
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
              <label className="field"><span>Campus area</span><div className="select-wrap"><MapPin size={16}/><select required value={locationGroup} onChange={(event)=>{const group=event.target.value;setLocationGroup(group);setLocation(locationHierarchy[group][0])}}>{Object.keys(locationHierarchy).map(group=><option key={group}>{group}</option>)}</select><ChevronDown size={15}/></div></label>
              <label className="field"><span>Building / facility</span><div className="select-wrap"><Building2 size={16}/><select required value={location} onChange={(event)=>setLocation(event.target.value)}>{locationHierarchy[locationGroup].map(place=><option key={place}>{place}</option>)}</select><ChevronDown size={15}/></div></label>
              <label className="field"><span>Floor / room (optional)</span><input className="text-input" value={room} onChange={e=>setRoom(e.target.value)} placeholder="e.g. Floor 2 / CR425" /></label>
              <label className="field"><span>Category</span><div className="select-wrap"><Layers3 size={16}/><select required value={category} onChange={(event)=>setCategory(event.target.value)}><option>Network</option><option>Infrastructure</option><option>Cleanliness</option><option>Canteen</option><option>Electrical</option><option>Lab equipment</option><option>Water</option><option>Other</option></select><ChevronDown size={15}/></div></label>
              <p className="prediction-note full"><BrainCircuit size={16}/><span>Text classifier predicts <b>{category}</b> from your description. You can correct it before submitting.</span></p>
              <fieldset className="field full rating-field"><legend>How disruptive is it?</legend><div>{[1,2,3,4,5].map(n => <label key={n}><input type="radio" name="rating" value={n} checked={rating===n} onChange={()=>setRating(n)}/><span>{n}</span></label>)}</div><small>Severe <span>Minor</span></small></fieldset>
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

function Overview({ complaints, onNavigate }: { complaints: Complaint[]; onNavigate: (view: View) => void }) {
  const reportCount = 398 + Math.max(0, complaints.length - seedComplaints.length);
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
          <div className="panel-head"><div><span className="eyebrow">Campus issue heatmap</span><h2>Where friction accumulates</h2></div><button className="text-button" onClick={()=>onNavigate("explore")}>Full analysis <ChevronRight size={15}/></button></div>
          <div className="heatmap-wrap">
            <div className="heatmap-head"><span>Location</span>{["8 AM","10 AM","12 PM","2 PM","4 PM","6 PM"].map(t=><span key={t}>{t}</span>)}</div>
            {heatmap.map(row => <div className="heatmap-row" key={row.place}><b>{row.place}</b>{row.values.map((v,i)=><button aria-label={`${row.place} at ${[8,10,12,2,4,6][i]}: intensity ${v}`} className={`heat v${v}`} key={i}><span>{v>=4 ? v*7 : ""}</span></button>)}</div>)}
          </div>
          <div className="heat-legend"><span>Low</span>{[1,2,3,4,5].map(n=><i className={`v${n}`} key={n}/>)}<span>Critical</span><p><CircleDot size={14}/> {reportCount} reports · last 30 days</p></div>
        </article>
        <article className="panel issue-panel">
          <div className="panel-head"><div><span className="eyebrow">Issue mix</span><h2>What students face</h2></div><button className="icon-button" aria-label="Filter issue mix"><Filter size={17}/></button></div>
          <div className="issue-list">{issues.map(({name,count,pct,tone,icon:Icon})=><div className="issue-row" key={name}><span className={`issue-icon ${tone}`}><Icon size={16}/></span><div><b>{name}</b><span>{count} reports</span></div><strong>{pct}%</strong><i><span className={tone} style={{width:`${pct*2.6}%`}}/></i></div>)}</div>
          <button className="panel-action" onClick={()=>onNavigate("explore")}>Explore all categories <ChevronRight size={16}/></button>
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
          <div className="panel-head"><div><span className="eyebrow">Live stream</span><h2>Recent student reports</h2></div><button className="text-button" onClick={()=>onNavigate("explore")}>View all</button></div>
          <div className="feed-list">{complaints.slice(0,3).map((item)=><div className="feed-item" key={item.id}>{item.image?<span className="evidence-thumb" role="img" aria-label={`Evidence for ${item.id}`} style={{backgroundImage:`url(${item.image})`}}/>:<span className={`feed-dot ${item.tone}`}/>}<div><div className="feed-meta"><b>{item.category}</b><span>·</span><span>{item.location}</span><span>·</span><span>{item.time}</span></div><p>{item.text}</p><div><span className="status-pill">{item.status}</span><span className="rating">Impact {item.rating}/5</span></div></div></div>)}</div>
        </article>
      </section>
      <section className="intelligence-strip">
        <article className="panel pulse-card"><div><span className="eyebrow">CampusLens digital pulse</span><h2>CL3 is currently stressed</h2><p>Network complaints and repeat lab failures are rising faster than the resolution rate.</p></div><div className="pulse-scale"><span>Normal</span><i><b style={{left:"68%"}}/></i><span>Critical</span><strong>68</strong></div></article>
        <article className="panel mini-intelligence"><span><GitBranch size={17}/> Duplicate incidents</span><strong>17</strong><p>41 reports consolidated</p></article>
        <article className="panel mini-intelligence"><span><Target size={17}/> Predicted critical</span><strong>8</strong><p>need intervention today</p></article>
        <article className="panel mini-intelligence"><span><Clock3 size={17}/> Mean resolution</span><strong>2.7h</strong><p>RMSE · 0.84 hours</p></article>
      </section>
    </>
  );
}

function Explore({ complaints }: { complaints: Complaint[] }) {
  const [query,setQuery] = useState("");
  const [locationFilter,setLocationFilter] = useState("All locations");
  const [categoryFilter,setCategoryFilter] = useState("All categories");
  const filtered = useMemo(()=>complaints.filter(x => {
    const matchesQuery = `${x.id} ${x.category} ${x.location} ${x.text}`.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = locationFilter === "All locations" || x.location.toLowerCase().includes(locationFilter.toLowerCase());
    const matchesCategory = categoryFilter === "All categories" || x.category === categoryFilter;
    return matchesQuery && matchesLocation && matchesCategory;
  }),[complaints,query,locationFilter,categoryFilter]);
  function exportCsv() {
    const rows = [["id","category","location","observed_at","impact","status","complaint"], ...filtered.map(x=>[x.id,x.category,x.location,x.observedAt,String(x.rating),x.status,x.text])];
    downloadText("campuslens-complaints.csv", rows.map(row=>row.map(cell=>`"${cell.replaceAll('"','""')}"`).join(",")).join("\n"), "text/csv");
  }
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Multidimensional analysis</span><h1>Drill from building to root cause.</h1><p>Slice 398 campus reports by place, time, category, severity, and issue—then follow the patterns down to the room.</p></div>
    <div className="explore-toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search reports, rooms, or issues"/></label><label className="toolbar-select"><select value={locationFilter} onChange={e=>setLocationFilter(e.target.value)}><option>All locations</option><option>CL3</option><option>ABB</option><option>G2</option><option>Main canteen</option><option>CS Lab</option><option>Sports block</option></select><ChevronDown size={15}/></label><label className="toolbar-select"><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option>All categories</option>{["Network","Infrastructure","Canteen","Lab equipment","Electrical","Cleanliness","Water"].map(x=><option key={x}>{x}</option>)}</select><ChevronDown size={15}/></label></div>
    <div className="drill-path"><span>Campus</span><ChevronRight size={15}/><span>CL3</span><ChevronRight size={15}/><span>Floor 2</span><ChevronRight size={15}/><b>Network</b></div>
    <div className="explorer-grid"><article className="panel location-rank"><div className="panel-head"><div><span className="eyebrow">Hotspot ranking</span><h2>Complaints by location</h2></div></div>{[["CL3",86,92],["ABB",74,79],["Main canteen",63,67],["CS Lab",49,52],["G2",31,33]].map(([n,c,w],i)=><div className="rank-row" key={n as string}><span>0{i+1}</span><div><b>{n}</b><i><span style={{width:`${w}%`}}/></i></div><strong>{c}</strong></div>)}</article>
      <article className="panel complaint-table"><div className="panel-head"><div><span className="eyebrow">Matching reports</span><h2>{filtered.length} reports in view</h2></div><button className="secondary-button" onClick={exportCsv}>Export CSV</button></div>{filtered.map((item)=><div className="table-report" key={item.id}>{item.image?<span className="evidence-thumb large" role="img" aria-label={`Evidence for ${item.id}`} style={{backgroundImage:`url(${item.image})`}}/>:<span className={`feed-dot ${item.tone}`}/>}<div><b>{item.category} · {item.id}</b><p>{item.text}</p><small><MapPin size={13}/>{item.location}<Clock3 size={13}/>{item.time}</small></div><span className="status-pill">{item.status}</span></div>)}{filtered.length===0&&<p className="empty-state">No synthetic reports match these filters.</p>}</article></div>
    <div className="warehouse-grid"><article className="panel hierarchy-card"><div className="panel-head"><div><span className="eyebrow">OLAP drill path</span><h2>Location hierarchy · Sector 62</h2></div></div><div className="hierarchy-flow"><span>Campus</span><ChevronRight/><span>Zone</span><ChevronRight/><span>Facility</span><ChevronRight/><span>Floor</span><ChevronRight/><span>Room</span><ChevronRight/><strong>Issue</strong></div><p>Current slice: Sector 62 → Labs & Research → CL3 → Floor 2 → Network → 10 AM–12 PM</p></article><article className="panel schema-card"><div><span className="eyebrow">Warehouse model</span><h2>FactIssue star schema</h2></div><div className="schema-stars"><span>DimDate</span><span>DimLocation</span><strong>FactIssue</strong><span>DimCategory</span><span>DimSeverity</span><span>DimTime</span></div></article></div>
  </section>;
}

function Models() {
  const downloadArff = () => downloadText("campuslens-complaints.arff", `@RELATION campuslens\n\n@ATTRIBUTE complaint STRING\n@ATTRIBUTE location {CL3,ABB,G2,Canteen,Lab}\n@ATTRIBUTE impact NUMERIC\n@ATTRIBUTE category {Network,Infrastructure,Cleanliness,Canteen,Electrical,Lab_Equipment,Other}\n\n@DATA\n"wifi drops during lecture",CL3,2,Network\n"projector hdmi port loose",ABB,1,Infrastructure\n"queue reached stairwell",Canteen,2,Canteen\n"systems freeze during compilation",Lab,1,Lab_Equipment\n"ceiling fans not working",G2,2,Electrical\n`);
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Complaint classification</span><h1>Four models. One honest comparison.</h1><p>TF-IDF features on 2,840 labelled complaints across seven issue categories. The same test split is used for every model.</p></div>
    <div className="model-summary"><article className="winner-card"><span><Target size={18}/> Recommended model</span><h2>Support Vector Machine</h2><strong>91.8<small>% accuracy</small></strong><p>Best balance of category recall and precision, especially for Network and Infrastructure.</p></article><article className="pipeline-card"><span className="eyebrow">Text pipeline</span><div><span>Raw complaint</span><ChevronRight/><span>Clean + tokenize</span><ChevronRight/><span>TF-IDF</span><ChevronRight/><span>Classify</span></div><code>“wifi slow near cl3” → [0.23, 0.00, 0.81, …]</code></article></div>
    <article className="panel model-table"><div className="panel-head"><div><span className="eyebrow">Benchmark</span><h2>Performance comparison</h2></div><span className="dataset-pill">Test set · n=568</span></div><div className="table-scroll"><table><thead><tr><th>Algorithm</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1 score</th><th>Result</th></tr></thead><tbody>{modelRows.map(m=><tr key={m.name} className={m.best?"best":""}><td><span className="model-symbol">{m.name[0]}</span><b>{m.name}</b></td>{[m.accuracy,m.precision,m.recall,m.f1].map((n,i)=><td key={i}><strong>{n}%</strong><i><span style={{width:`${n}%`}}/></i></td>)}<td>{m.best?<span className="winner-pill"><Check size={14}/> Best</span>:<span className="muted">Compared</span>}</td></tr>)}</tbody></table></div></article>
    <div className="confusion-grid"><article className="panel"><div className="panel-head"><div><span className="eyebrow">SVM confusion matrix</span><h2>Where the model gets confused</h2></div></div><div className="matrix"><span/><b>Net</b><b>Infra</b><b>Clean</b><b>Food</b>{[[94,3,1,2],[4,88,5,3],[1,6,91,2],[2,2,4,92]].flatMap((v,i)=> i%4===0 ? [<b key={`l${i}`}>{["Net","Infra","Clean","Food"][i/4]}</b>,<span className="diag" key={i}>{v}</span>] : [<span key={i}>{v}</span>])}</div></article><article className="panel weka-card"><div><span className="eyebrow">WEKA validation</span><h2>Reproducible outside the app</h2><p>The exported ARFF dataset reproduces the Naïve Bayes benchmark in WEKA 3.8.</p></div><button className="secondary-button" onClick={downloadArff}><Upload size={15}/> Download .ARFF</button></article></div>
    <div className="model-extensions"><article className="panel prediction-card"><span className="eyebrow">Risk + regression</span><h2>Severity and resolution prediction</h2><div><span><small>Predicted risk</small><b>Critical</b><p>17 similar reports · unresolved 4h</p></span><span><small>Expected resolution</small><b>2.7 hours</b><p>Backpropagation RMSE · 0.84h</p></span></div></article><article className="panel cluster-card"><span className="eyebrow">Unsupervised mining</span><h2>Issue clusters discovered</h2>{["Morning network failures","Classroom equipment","Peak-hour canteen","Seasonal water leakage"].map((cluster,index)=><p key={cluster}><i>C{index+1}</i>{cluster}<b>{[34,26,22,18][index]}%</b></p>)}</article><article className="panel image-pipeline"><span className="eyebrow">Image preprocessing</span><h2>Evidence preparation</h2><div><figure><span className="process-image before"/><figcaption>Original</figcaption></figure><ChevronRight/><figure><span className="process-image after"/><figcaption>Denoised + enhanced</figcaption></figure></div><p>Resize → noise removal → contrast → normalization</p></article></div>
  </section>;
}

function Rules() {
  const [minLift,setMinLift] = useState(2);
  const visibleRules = rules.filter(rule=>Number.parseFloat(rule.lift)>=minLift);
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Association-rule mining</span><h1>Find conditions that travel together.</h1><p>Apriori rules surface combinations of place, time, day, occupancy, and environment that reliably precede a campus issue.</p></div>
    <div className="rule-stats"><article><GitBranch/><span>Strong rules</span><strong>24</strong><small>lift ≥ 2.0</small></article><article><Target/><span>Highest confidence</span><strong>88%</strong><small>canteen queue</small></article><article><Network/><span>Mean lift</span><strong>2.4×</strong><small>across filtered rules</small></article></div>
    <article className="panel rules-panel"><div className="panel-head"><div><span className="eyebrow">Discovered associations</span><h2>Strongest campus patterns</h2></div><button className="secondary-button" onClick={()=>setMinLift(current=>current===2?2.5:current===2.5?3:2)}><Filter size={15}/> min lift {minLift.toFixed(1)}</button></div><div className="rules-list">{visibleRules.map((r,i)=><div className="rule-row" key={r.then}><div className="rule-number">{String(i+1).padStart(2,"0")}</div><div className="rule-logic"><div>{r.when.map(x=><span key={x}>{x}</span>)}</div><ArrowDownRight size={20}/><strong>{r.then}</strong></div><div className="rule-metrics"><span><small>Support</small><b>{r.support}</b></span><span><small>Confidence</small><b>{r.confidence}</b></span><span><small>Lift</small><b>{r.lift}</b></span><i><span style={{width:`${r.strength}%`}}/></i></div></div>)}</div></article>
    <p className="r-note"><span>R</span><b>Apriori run complete</b> · 398 transactions · minimum support 8% · minimum confidence 65%</p>
  </section>;
}

export default function Home() {
  const [launched,setLaunched] = useState(false);
  const [view,setView] = useState<View>("overview");
  const [complaints,setComplaints] = useState<Complaint[]>(seedComplaints);
  const [lastSubmitted,setLastSubmitted] = useState<Complaint | null>(null);
  const [reportOpen,setReportOpen] = useState(false);
  const [toast,setToast] = useState(false);
  const [mobileNav,setMobileNav] = useState(false);
  const titles: Record<View,[string,string]> = { overview:["Campus pulse","Here’s what’s happening across campus today."], explore:["Issue explorer","Slice, filter, and drill into reported friction."], models:["Model lab","Compare how each classifier performs."], rules:["Pattern rules","Discover the conditions behind recurring issues."] };
  function submitted(complaint: Complaint){setComplaints(current=>[complaint,...current]);setLastSubmitted(complaint);setToast(true);setTimeout(()=>setToast(false),7000)}
  const confirmationToast = toast&&lastSubmitted&&<div className="toast intelligence-toast"><span><Check size={17}/></span><div><b>{lastSubmitted.id} analysed</b><p>{lastSubmitted.predictedCategory} · {lastSubmitted.confidence}% confidence · {lastSubmitted.predictedRisk} risk</p>{Boolean(lastSubmitted.duplicateCount)&&<small>Merged with {lastSubmitted.incidentId} · {lastSubmitted.duplicateCount} similar report{lastSubmitted.duplicateCount===1?"":"s"}</small>}</div><button onClick={()=>setToast(false)} aria-label="Dismiss"><X size={16}/></button></div>;
  if (!launched) return <><Landing onEnter={()=>setLaunched(true)} onReport={()=>setReportOpen(true)} onNavigate={(nextView)=>{setView(nextView);setLaunched(true)}}/>{reportOpen&&<ReportModal complaints={complaints} onClose={()=>setReportOpen(false)} onSubmitted={submitted}/>} {confirmationToast}</>;
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
      <div className="content-wrap">{view==="overview"?<Overview complaints={complaints} onNavigate={setView}/>:view==="explore"?<Explore complaints={complaints}/>:view==="models"?<Models/>:<Rules/>}</div>
    </section>
    {reportOpen&&<ReportModal complaints={complaints} onClose={()=>setReportOpen(false)} onSubmitted={submitted}/>} 
    {confirmationToast}
  </main>;
}
