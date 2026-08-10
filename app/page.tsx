"use client";
/* eslint-disable @next/next/no-img-element -- user evidence uses validated local data URLs */

import analyticsArtifact from "@/public/data/analytics.json";
import Image from "next/image";
import Link from "next/link";
import {
  CATEGORIES,
  Category,
  Complaint,
  classifyComplaint,
  findDuplicates,
  redactPii,
} from "@/lib/campuslens";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BrainCircuit, Building2,
  CalendarDays, Camera, Check, ChevronDown, ChevronRight, CircleDot, Clock3,
  Database, FileCheck2, Filter, GitBranch, Layers3, Lightbulb, MapPin, Menu,
  MessageSquareWarning, Network, Plus, Search, ShieldCheck, Sparkles, Target,
  Upload, Users, Wifi, X, Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "overview" | "explore" | "models" | "rules" | "methodology";
type Analytics = typeof analyticsArtifact;

const locationHierarchy: Record<string, string[]> = {
  "Academic & Teaching": ["Academic Block", "A2/1", "A2/2", "Aryabhatt Bhawan II", "Aryabhatt Bhawan III", "CR rooms", "CS rooms", "G rooms", "FF rooms", "TS rooms"],
  "Labs & Research": ["CL1", "CL2", "CL3", "CL15", "CL22", "CSE / IT Labs", "ECE Labs", "Biotechnology Labs", "AICTE IDEA Lab", "Innovation Hub", "5G Use Case Lab", "R&D Centres"],
  "Library & Study": ["Learning Resource Centre (LRC)", "Reading area", "Digital resource area", "Group study area"],
  Administration: ["Administration Block", "Registrar Office", "Academic Office", "Admission Cell", "Accounts Office", "Examination Cell", "Training & Placement Cell", "Faculty Offices"],
  Food: ["Annapurna / Main Mess", "Cafeteria / Canteen"],
  Hostels: ["H4 Boys Hostel", "H5 Boys Hostel", "Girls Hostel", "Hostel common rooms", "Hostel washrooms", "Hostel entrances"],
  "Sports & Recreation": ["Basketball Court", "Lawn Tennis Court", "Badminton facilities", "Volleyball Court", "Football area", "Swimming Pool", "Squash Courts", "Table Tennis area", "Boys Gym", "Girls Gym"],
  "General & Utilities": ["Auditorium", "Seminar Hall", "First Aid Centre", "Main Gate", "Parking", "Water cooler", "Washrooms", "Staircases", "Lifts", "Corridors", "Wi-Fi infrastructure point"],
};

const navItems: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "explore", label: "Issue explorer", icon: Search },
  { id: "models", label: "Model lab", icon: BrainCircuit },
  { id: "rules", label: "Pattern rules", icon: GitBranch },
];

const iconByCategory: Record<string, typeof Wifi> = {
  Network: Wifi, Infrastructure: Building2, Cleanliness: Sparkles, Canteen: Users,
  Electrical: Zap, "Lab Equipment": BrainCircuit, Water: CircleDot, Other: Layers3,
};
const toneByCategory: Record<string, string> = {
  Network: "green", Infrastructure: "orange", Cleanliness: "purple", Canteen: "yellow",
  Electrical: "purple", "Lab Equipment": "blue", Water: "blue", Other: "yellow",
};
const ease = [0.22, 1, 0.36, 1] as const;
const fadeDown = { hidden: { opacity: 0, y: -20 }, visible: (index: number) => ({ opacity: 1, y: 0, transition: { delay: index * 0.08, duration: 0.45, ease } }) };
const fadeUp = { hidden: { opacity: 0, y: 28 }, visible: (index: number) => ({ opacity: 1, y: 0, transition: { delay: index * 0.1, duration: 0.55, ease } }) };

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><span /><span /><span /><span /></span>;
}

function Landing({ onEnter, onReport, onNavigate }: { onEnter: () => void; onReport: () => void; onNavigate: (view: View) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links: { label: string; view: View }[] = [
    { label: "Signals", view: "overview" }, { label: "Explore", view: "explore" },
    { label: "Models", view: "models" }, { label: "Rules", view: "rules" },
  ];
  const navigate = (view: View) => { setMenuOpen(false); onNavigate(view); };
  return <div className="landing-page">
    <nav className="landing-nav" aria-label="Landing page navigation">
      <motion.button custom={0} initial="hidden" animate="visible" variants={fadeDown} className="landing-brand" onClick={onEnter} aria-label="Open CampusLens dashboard">
        <span className="orbit-logo"><i /></span><span><b>CAMPUS</b>LENS</span>
      </motion.button>
      <div className="landing-links">{links.map((link, index) => <motion.button custom={index + 1} initial="hidden" animate="visible" variants={fadeDown} key={link.view} onClick={() => navigate(link.view)}>{link.label}</motion.button>)}<motion.span custom={5} initial="hidden" animate="visible" variants={fadeDown}><Link href="/problem-statement">The problem</Link></motion.span></div>
      <motion.button custom={5} initial="hidden" animate="visible" variants={fadeDown} className="landing-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><span /><span /><span /></motion.button>
    </nav>
    <section className="landing-hero">
      <div className="landing-orbital" aria-hidden="true"><i /><i /><i /><b /></div>
      <div className="landing-media-stack" aria-label="Campus friction evidence">
        <motion.figure custom={3} initial="hidden" animate="visible" variants={fadeUp} className="landing-media-primary">
          <Image src="/images/brand/campus-night-map.webp" alt="Nocturnal campus hotspots connected by data trails" fill priority sizes="(max-width: 767px) 58vw, 31vw" />
          <figcaption><span>Field signal 01</span><b>Friction map · 22:14</b></figcaption>
        </motion.figure>
        <motion.figure custom={4} initial="hidden" animate="visible" variants={fadeUp} className="landing-media-secondary">
          <Image src="/images/brand/campus-friction-collage.webp" alt="Campus network, crowding, queue and projector problems" fill sizes="(max-width: 767px) 43vw, 21vw" />
          <figcaption><span>Evidence set 04</span><b>Recurring conditions</b></figcaption>
        </motion.figure>
      </div>
      <div className="landing-video-overlay" />
      <div className="landing-stats" aria-label="CampusLens verified dataset statistics">
        {[[String(analyticsArtifact.datasetCount), "CAMPUS\nREPORTS"], [String(analyticsArtifact.association.rules.length), "STRONG\nRULES"], [String(analyticsArtifact.models.models[0].accuracy), "MODEL\nACCURACY"]].map(([value, label], index) => <motion.div custom={index + 2} initial="hidden" animate="visible" variants={fadeUp} className="landing-stat" key={label}><strong><span>+</span>{value}{label.startsWith("MODEL") && <small>%</small>}</strong><p>{label}</p></motion.div>)}
      </div>
      <div className="landing-bottom">
        <div className="landing-bottom-a"><motion.p custom={5} initial="hidden" animate="visible" variants={fadeUp}>Turning Everyday<br />Friction Into<br />Campus-Wide Action</motion.p><motion.button custom={6} initial="hidden" animate="visible" variants={fadeUp} onClick={onReport}>Report friction <ArrowUpRight size={22} /></motion.button></div>
        <div className="landing-bottom-b"><motion.p custom={7} initial="hidden" animate="visible" variants={fadeUp}>A reproducible campus intelligence system built on {analyticsArtifact.datasetCount.toLocaleString()} validated synthetic records.</motion.p><h1 className="landing-headline">{["Hidden", "Friction", "Revealed"].map((word, index) => <span key={word}><motion.b initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ delay: 0.35 + index * 0.12, duration: 0.65, ease }}>{word}</motion.b></span>)}</h1></div>
      </div>
    </section>
    <AnimatePresence>{menuOpen && <motion.div className="landing-menu-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="landing-menu-top"><span className="landing-brand"><span className="orbit-logo"><i /></span><span><b>CAMPUS</b>LENS</span></span><button className="landing-menu-button close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div><div className="landing-menu-links">{links.map((link) => <button key={link.view} onClick={() => navigate(link.view)}>{link.label}</button>)}<Link href="/problem-statement">The problem</Link></div><button className="landing-menu-report" onClick={onReport}>Report friction <ArrowUpRight size={22} /></button></motion.div>}</AnimatePresence>
  </div>;
}

async function processEvidence(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a valid image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be 8 MB or smaller.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / bitmap.width, 480 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.filter = "contrast(1.15) saturate(1.05)";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.78);
}

function ReportModal({ onClose, onSubmitted, complaints }: { onClose: () => void; onSubmitted: (complaint: Complaint) => void; complaints: Complaint[] }) {
  const [step, setStep] = useState(1);
  const [image, setImage] = useState<string | null>(null);
  const [imageConsent, setImageConsent] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationGroup, setLocationGroup] = useState("Labs & Research");
  const [location, setLocation] = useState("CL3");
  const [room, setRoom] = useState("");
  const prediction = useMemo(() => classifyComplaint(`${title} ${description}`), [title, description]);
  const [category, setCategory] = useState<Category>("Network");
  const [rating, setRating] = useState(2);
  const [anonymous, setAnonymous] = useState(true);
  const [reporterName, setReporterName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>(".form-body input:not([type='hidden']), .form-body textarea, .form-body select, .form-body button");
    first?.focus();
  }, [step]);
  useEffect(() => {
    function handleDialogKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])") ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleDialogKey);
    return () => document.removeEventListener("keydown", handleDialogKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (step < 2) {
      if (title.trim().length < 4 || description.trim().length < 12) return setError("Add a clear title and at least 12 characters of detail.");
      setCategory(prediction.category);
      return setStep(2);
    }
    if (image && !imageConsent) return setError("Confirm consent before attaching image evidence.");
    const cleaned = redactPii(description);
    const locationLabel = `${location}${room.trim() ? ` · ${room.trim()}` : ""}`;
    const duplicates = findDuplicates({ text: cleaned, category, facility: location, location: locationLabel }, complaints);
    setSubmitting(true);
    try {
      const response = await fetch("/api/complaints", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, text: cleaned, category, zone: locationGroup, facility: location, floor: room || "Unspecified", room: room || "Unspecified", location: locationLabel, rating, anonymous, reporterName: anonymous ? undefined : reporterName.trim(), duplicateCount: duplicates.length, occupancy: 55, image: image ?? undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Submission failed.");
      onSubmitted({ ...result.complaint, image: image ?? undefined, incidentId: duplicates[0]?.complaint.incidentId ?? (duplicates.length ? `INC-${duplicates[0].complaint.id}` : undefined), duplicateCount: duplicates.length });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Submission failed.");
    } finally { setSubmitting(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={dialogRef} className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" tabIndex={-1}>
      <header className="modal-header"><div><span className="eyebrow">Privacy-aware campus report</span><h2 id="report-title">What’s getting in your way?</h2></div><button className="icon-button" onClick={onClose} aria-label="Close report form"><X size={20} /></button></header>
      <div className="stepper" aria-label={`Step ${step} of 2`}><span className="active"><b>1</b> Describe</span><i /><span className={step === 2 ? "active" : ""}><b>2</b> Details</span></div>
      <form onSubmit={submit}>
        {step === 1 ? <div className="form-body">
          <label className="field full"><span>Issue title</span><input className="text-input" required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. CL3 Wi-Fi outage" /></label>
          <label className="field full"><span>Complaint</span><textarea required minLength={12} maxLength={1200} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Wi-Fi becomes extremely slow near CL3 between 10 and 12." rows={4} /></label>
          <div className="identity-row full"><button type="button" className={anonymous ? "active" : ""} onClick={() => setAnonymous(true)}>Anonymous</button><button type="button" className={!anonymous ? "active" : ""} onClick={() => setAnonymous(false)}>Named</button>{!anonymous && <input aria-label="Reporter name" className="text-input" value={reporterName} onChange={(event) => setReporterName(event.target.value)} placeholder="Your name" required maxLength={80} />}</div>
          <p className="prediction-note full"><BrainCircuit size={16} /><span>Live {prediction.algorithm} suggestion: <b>{prediction.category}</b> · {prediction.confidence}% confidence.</span></p>
          {error && <p className="form-error full" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit">Continue <ChevronRight size={17} /></button>
          <p className="privacy-note"><ShieldCheck size={15} /> Emails, phone numbers and student IDs are redacted automatically.</p>
        </div> : <div className="form-body detail-grid">
          <label className="field"><span>Campus area</span><div className="select-wrap"><MapPin size={16} /><select required value={locationGroup} onChange={(event) => { const group = event.target.value; setLocationGroup(group); setLocation(locationHierarchy[group][0]); }}>{Object.keys(locationHierarchy).map((group) => <option key={group}>{group}</option>)}</select><ChevronDown size={15} /></div></label>
          <label className="field"><span>Building / facility</span><div className="select-wrap"><Building2 size={16} /><select required value={location} onChange={(event) => setLocation(event.target.value)}>{locationHierarchy[locationGroup].map((place) => <option key={place}>{place}</option>)}</select><ChevronDown size={15} /></div></label>
          <label className="field"><span>Floor / room</span><input className="text-input" value={room} onChange={(event) => setRoom(event.target.value)} placeholder="e.g. Floor 2 / CR425" maxLength={80} /></label>
          <label className="field"><span>Category</span><div className="select-wrap"><Layers3 size={16} /><select required value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></div></label>
          <p className="prediction-note full"><BrainCircuit size={16} /><span>Model prediction: <b>{prediction.category}</b>. Your corrected category will be stored as the final label.</span></p>
          <fieldset className="field full rating-field"><legend>How disruptive is it?</legend><div>{[1, 2, 3, 4, 5].map((number) => <label key={number}><input type="radio" name="rating" value={number} checked={rating === number} onChange={() => setRating(number)} /><span>{number}</span></label>)}</div><small>Severe <span>Minor</span></small></fieldset>
          <div className="field full"><span>Optional image</span><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setError(""); try { setImage(await processEvidence(file)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Image could not be processed."); } }} /><button type="button" className="upload-zone" onClick={() => fileRef.current?.click()}>{image ? <><img src={image} alt="Processed complaint evidence preview" /><span><Check size={17} /> Resized, enhanced and EXIF-free</span></> : <><span className="upload-icon"><Camera size={21} /></span><b>Add a photo</b><small>JPEG, PNG or WebP · max 8 MB</small></>}</button></div>
          {image && <label className="consent-check full"><input type="checkbox" checked={imageConsent} onChange={(event) => setImageConsent(event.target.checked)} /> I consent to using this image as campus issue evidence.</label>}
          {error && <p className="form-error full" role="alert">{error}</p>}
          <div className="form-actions full"><button type="button" className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" disabled={submitting} type="submit">{submitting ? "Analysing…" : anonymous ? "Submit anonymously" : "Submit named report"} <Upload size={16} /></button></div>
        </div>}
      </form>
    </div>
  </div>;
}

function Overview({ complaints, analytics, onNavigate }: { complaints: Complaint[]; analytics: Analytics; onNavigate: (view: View) => void }) {
  const userCount = Math.max(0, complaints.length - analytics.datasetCount);
  const issueMix = useMemo(() => analytics.issueMix.map((item) => ({ ...item, count: item.count + complaints.slice(0, userCount).filter((record) => record.category === item.name).length })), [complaints, analytics.issueMix, userCount]);
  const total = issueMix.reduce((sum, item) => sum + item.count, 0);
  const maximumHeat = Math.max(...analytics.heatmap.rows.flatMap((row) => row.values));
  return <>
    <section className="hero-grid">
      <article className="health-card"><div className="card-heading"><div><span className="eyebrow light">Campus health score</span><p>Computed from severity and resolution state</p></div><span className="live-pill"><i /> Reproducible</span></div><div className="score-wrap"><strong>{analytics.campusHealthScore}</strong><span>/ 100</span><div className="score-ring" aria-label={`${analytics.campusHealthScore} out of 100`} /></div><div className="score-footer"><span><Database size={14} /> SQLite warehouse</span><p>{analytics.unresolvedCount} unresolved</p></div></article>
      <article className="metric-card accent-lime"><div className="metric-icon"><Wifi size={20} /></div><span>Top recurring issue</span><strong>{issueMix[0].name}</strong><div className="metric-bottom"><b>{Math.round(issueMix[0].count / total * 100)}%</b><p>{issueMix[0].count} reports</p></div></article>
      <article className="metric-card"><div className="metric-icon coral"><MapPin size={20} /></div><span>Most affected location</span><strong>{analytics.hotspots[0].name}</strong><div className="metric-bottom"><b>{analytics.hotspots[0].count}</b><p>warehouse records</p></div></article>
      <article className="metric-card"><div className="metric-icon amber"><Clock3 size={20} /></div><span>Best classifier</span><strong>{analytics.models.bestModel}</strong><div className="metric-bottom"><b>{analytics.models.models[0].f1}%</b><p>weighted F1</p></div></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel heatmap-panel"><div className="panel-head"><div><span className="eyebrow">Warehouse heatmap</span><h2>Where friction accumulates</h2></div><button className="text-button" onClick={() => onNavigate("explore")}>Full analysis <ChevronRight size={15} /></button></div><div className="heatmap-wrap"><div className="heatmap-head"><span>Location</span>{analytics.heatmap.timeBands.map((time) => <span key={time}>{time}</span>)}</div>{analytics.heatmap.rows.map((row) => <div className="heatmap-row" style={{ gridTemplateColumns: `115px repeat(${analytics.heatmap.timeBands.length},1fr)` }} key={row.place}><b>{row.place}</b>{row.values.map((value, index) => { const intensity = Math.max(1, Math.ceil(value / maximumHeat * 5)); return <button aria-label={`${row.place}, ${analytics.heatmap.timeBands[index]}: ${value} reports`} className={`heat v${intensity}`} key={analytics.heatmap.timeBands[index]}><span>{value}</span></button>; })}</div>)}</div><div className="heat-legend"><span>Low</span>{[1, 2, 3, 4, 5].map((number) => <i className={`v${number}`} key={number} />)}<span>Critical</span><p><CircleDot size={14} /> {total.toLocaleString()} reports</p></div></article>
      <article className="panel issue-panel"><div className="panel-head"><div><span className="eyebrow">Issue mix</span><h2>Derived from clean data</h2></div><button className="icon-button" aria-label="Explore issue filters" onClick={() => onNavigate("explore")}><Filter size={17} /></button></div><div className="issue-list">{issueMix.slice(0, 6).map((item) => { const Icon = iconByCategory[item.name] ?? Layers3; const pct = item.count / total * 100; const tone = toneByCategory[item.name]; return <div className="issue-row" key={item.name}><span className={`issue-icon ${tone}`}><Icon size={16} /></span><div><b>{item.name}</b><span>{item.count} reports</span></div><strong>{pct.toFixed(1)}%</strong><i><span className={tone} style={{ width: `${Math.min(100, pct * 3)}%` }} /></i></div>; })}</div><button className="panel-action" onClick={() => onNavigate("explore")}>Explore all categories <ChevronRight size={16} /></button></article>
    </section>
    <section className="lower-grid">
      <article className="panel trend-panel"><div className="panel-head"><div><span className="eyebrow">Data quality</span><h2>ETL validation passed</h2></div><span className="trend-badge"><Check size={15} /> 0 missing</span></div><div className="quality-list">{analytics.dataQuality.transformations.slice(0, 5).map((item) => <p key={item}><FileCheck2 size={14} /> {item}</p>)}</div><p className="insight"><Lightbulb size={17} /><span><b>Traceable:</b> every metric is generated by <code>data_science/pipeline.py</code>.</span></p></article>
      <article className="panel feed-panel"><div className="panel-head"><div><span className="eyebrow">Report stream</span><h2>Recent validated records</h2></div><button className="text-button" onClick={() => onNavigate("explore")}>View all</button></div><div className="feed-list">{complaints.slice(0, 4).map((item) => <div className="feed-item" key={item.id}>{item.image ? <span className="evidence-thumb" role="img" aria-label={`Evidence for ${item.id}`} style={{ backgroundImage: `url(${item.image})` }} /> : <span className={`feed-dot ${toneByCategory[item.category]}`} />}<div><div className="feed-meta"><b>{item.category}</b><span>·</span><span>{item.location}</span><span>·</span><span>{item.time}</span></div><p>{item.text}</p><div><span className="status-pill">{item.status}</span><span className="rating">Impact {item.rating}/5</span></div></div></div>)}</div></article>
    </section>
    <section className="intelligence-strip"><article className="panel pulse-card"><div><span className="eyebrow">Reproducible digital pulse</span><h2>{analytics.hotspots[0].name} is the leading hotspot</h2><p>Computed from the physical warehouse, not a frontend constant.</p></div><div className="pulse-scale"><span>Normal</span><i><b style={{ left: `${100 - analytics.campusHealthScore}%` }} /></i><span>Critical</span><strong>{100 - analytics.campusHealthScore}</strong></div></article><article className="panel mini-intelligence"><span><Target size={17} /> Critical</span><strong>{analytics.criticalCount}</strong><p>severity-labelled records</p></article><article className="panel mini-intelligence"><span><Network size={17} /> Outliers</span><strong>{analytics.clustering.outlierCount}</strong><p>Isolation Forest</p></article><article className="panel mini-intelligence"><span><Clock3 size={17} /> Mean resolution</span><strong>{analytics.meanResolutionHours}h</strong><p>regression RMSE · {analytics.models.regression[0].rmse}</p></article></section>
  </>;
}

function Explore({ complaints, dateDays }: { complaints: Complaint[]; dateDays: number }) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("All locations");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [limit, setLimit] = useState(40);
  const latest = useMemo(() => Math.max(...complaints.map((item) => Date.parse(item.observedAt)).filter(Number.isFinite)), [complaints]);
  const filtered = useMemo(() => complaints.filter((item) => {
    const matchesDate = !dateDays || Date.parse(item.observedAt) >= latest - dateDays * 86_400_000;
    const matchesQuery = `${item.id} ${item.category} ${item.location} ${item.text}`.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = locationFilter === "All locations" || item.location.toLowerCase().includes(locationFilter.toLowerCase());
    const matchesCategory = categoryFilter === "All categories" || item.category === categoryFilter;
    return matchesDate && matchesQuery && matchesLocation && matchesCategory;
  }), [complaints, query, locationFilter, categoryFilter, dateDays, latest]);
  function exportCsv() {
    const rows = [["id", "category", "location", "observed_at", "impact", "status", "complaint"], ...filtered.map((item) => [item.id, item.category, item.location, item.observedAt, String(item.rating), item.status, item.text])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "campuslens-filtered.csv"; anchor.click(); URL.revokeObjectURL(anchor.href);
  }
  const locations = ["All locations", ...new Set(complaints.map((item) => item.facility ?? item.location.split(" · ")[0]))];
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Multidimensional analysis</span><h1>Drill from building to root cause.</h1><p>Search, slice and dice the clean complaint dataset by time, place and category.</p></div><div className="explore-toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports, rooms, or issues" /></label><label className="toolbar-select"><span className="sr-only">Location</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>{locations.map((location) => <option key={location}>{location}</option>)}</select><ChevronDown size={15} /></label><label className="toolbar-select"><span className="sr-only">Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={15} /></label></div><div className="drill-path"><span>JIIT Sector 62</span><ChevronRight size={15} /><span>{locationFilter}</span><ChevronRight size={15} /><b>{categoryFilter}</b></div><div className="explorer-grid"><article className="panel location-rank"><div className="panel-head"><div><span className="eyebrow">Hotspot ranking</span><h2>Complaints by location</h2></div></div>{analyticsArtifact.hotspots.slice(0, 7).map((item, index) => <div className="rank-row" key={item.name}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.name}</b><i><span style={{ width: `${item.pct}%` }} /></i></div><strong>{item.count}</strong></div>)}</article><article className="panel complaint-table"><div className="panel-head"><div><span className="eyebrow">Matching reports</span><h2>{filtered.length.toLocaleString()} reports in view</h2></div><button className="secondary-button" onClick={exportCsv}>Export CSV</button></div>{filtered.slice(0, limit).map((item) => <div className="table-report" key={item.id}>{item.image ? <span className="evidence-thumb large" role="img" aria-label={`Evidence for ${item.id}`} style={{ backgroundImage: `url(${item.image})` }} /> : <span className={`feed-dot ${toneByCategory[item.category]}`} />}<div><b>{item.category} · {item.id}</b><p>{item.text}</p><small><MapPin size={13} />{item.location}<Clock3 size={13} />{item.time}</small></div><span className="status-pill">{item.status}</span></div>)}{filtered.length > limit && <button className="panel-action" onClick={() => setLimit((current) => current + 40)}>Show 40 more</button>}{filtered.length === 0 && <p className="empty-state">No reports match these filters.</p>}</article></div><div className="warehouse-grid"><article className="panel hierarchy-card"><div className="panel-head"><div><span className="eyebrow">OLAP drill path</span><h2>Location hierarchy · Sector 62</h2></div></div><div className="hierarchy-flow"><span>Campus</span><ChevronRight /><span>Zone</span><ChevronRight /><span>Facility</span><ChevronRight /><span>Floor</span><ChevronRight /><span>Room</span><ChevronRight /><strong>Issue</strong></div><p>Use the filters above for slice and dice; room-level records support drill-down.</p></article><article className="panel schema-card"><div><span className="eyebrow">Physical warehouse</span><h2>FactComplaint star schema</h2></div><div className="schema-stars"><span>DimDate</span><span>DimLocation</span><strong>FactComplaint</strong><span>DimCategory</span><span>DimSeverity</span><span>DimTime</span></div></article></div></section>;
}

function Models({ analytics }: { analytics: Analytics }) {
  const modelRows = analytics.models.models;
  const matrix = analytics.models.confusionMatrix;
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Complaint classification</span><h1>Six trained models. One reproducible comparison.</h1><p>TF-IDF features on {analytics.models.datasetSize.toLocaleString()} labelled complaints with a stratified {analytics.models.testSize}-record test set and fixed seed {analytics.models.randomSeed}.</p></div><div className="model-summary"><article className="winner-card"><span><Target size={18} /> Recommended model</span><h2>{analytics.models.bestModel}</h2><strong>{modelRows[0].f1}<small>% weighted F1</small></strong><p>Selected from reproducible out-of-sample evaluation.</p></article><article className="pipeline-card"><span className="eyebrow">Executable text pipeline</span><div><span>Clean text</span><ChevronRight /><span>Tokenize</span><ChevronRight /><span>TF-IDF</span><ChevronRight /><span>Train + test</span></div><code>{analytics.models.featureCount} learned features · artifact served to browser</code></article></div><article className="panel model-table"><div className="panel-head"><div><span className="eyebrow">Benchmark</span><h2>Performance comparison</h2></div><span className="dataset-pill">Test set · n={analytics.models.testSize}</span></div><div className="table-scroll"><table><thead><tr><th>Algorithm</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1 score</th><th>Result</th></tr></thead><tbody>{modelRows.map((model) => <tr key={model.name} className={model.best ? "best" : ""}><td><span className="model-symbol">{model.name[0]}</span><b>{model.name}</b></td>{[model.accuracy, model.precision, model.recall, model.f1].map((number, index) => <td key={index}><strong>{number}%</strong><i><span style={{ width: `${number}%` }} /></i></td>)}<td>{model.best ? <span className="winner-pill"><Check size={14} /> Best</span> : <span className="muted">Compared</span>}</td></tr>)}</tbody></table></div></article><div className="confusion-grid"><article className="panel"><div className="panel-head"><div><span className="eyebrow">{analytics.models.bestModel} confusion matrix</span><h2>All eight categories</h2></div></div><div className="table-scroll"><div className="matrix matrix-wide" style={{ gridTemplateColumns: `72px repeat(${matrix.labels.length}, minmax(42px,1fr))` }}><span />{matrix.labels.map((label) => <b key={label}>{label.slice(0, 5)}</b>)}{matrix.values.flatMap((row, rowIndex) => [<b key={`label-${rowIndex}`}>{matrix.labels[rowIndex].slice(0, 8)}</b>, ...row.map((value, columnIndex) => <span className={rowIndex === columnIndex ? "diag" : ""} key={`${rowIndex}-${columnIndex}`}>{value}</span>)])}</div></div></article><article className="panel weka-card"><div><span className="eyebrow">WEKA validation</span><h2>Full reproducible export</h2><p>The ARFF contains all {analytics.models.datasetSize.toLocaleString()} clean records and all eight classes.</p></div><a className="secondary-button" href="/data/campuslens-complaints.arff" download><Upload size={15} /> Download .ARFF</a></article></div><div className="model-extensions"><article className="panel prediction-card"><span className="eyebrow">Regression</span><h2>Resolution prediction</h2><div>{analytics.models.regression.slice(0, 2).map((model) => <span key={model.name}><small>{model.name}</small><b>{model.rmse} RMSE</b><p>{model.best ? "Best holdout result" : "Compared"}</p></span>)}</div></article><article className="panel cluster-card"><span className="eyebrow">Unsupervised mining</span><h2>Issue clusters</h2>{analytics.clustering.clusters.slice(0, 4).map((cluster, index) => <p key={`${cluster.name}-${index}`}><i>C{index + 1}</i>{cluster.name}<b>{cluster.share}%</b></p>)}</article><article className="panel image-pipeline"><span className="eyebrow">Image preprocessing</span><h2>Real generated outputs</h2><div><figure><img className="process-image" src={analytics.imagePipeline.original} alt="Synthetic noisy lab evidence before processing" /><figcaption>Original</figcaption></figure><ChevronRight /><figure><img className="process-image" src={analytics.imagePipeline.processed} alt="Denoised and enhanced lab evidence" /><figcaption>Processed</figcaption></figure></div><p>{analytics.imagePipeline.operations.join(" → ")}</p></article></div></section>;
}

function Rules({ analytics }: { analytics: Analytics }) {
  const [minLift, setMinLift] = useState(2);
  const visible = analytics.association.rules.filter((rule) => rule.lift >= minLift);
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Association-rule mining</span><h1>Conditions discovered from transactions.</h1><p>Apriori and FP-Growth independently found the same {analytics.association.aprioriFrequentItemsets} frequent itemsets.</p></div><div className="rule-stats"><article><GitBranch /><span>Strong rules</span><strong>{visible.length}</strong><small>lift ≥ {minLift.toFixed(1)}</small></article><article><Target /><span>Transactions</span><strong>{analytics.association.transactionCount}</strong><small>clean warehouse rows</small></article><article><Network /><span>Algorithm agreement</span><strong>{analytics.association.algorithmsAgree ? "Yes" : "No"}</strong><small>Apriori vs FP-Growth</small></article></div><article className="panel rules-panel"><div className="panel-head"><div><span className="eyebrow">Discovered associations</span><h2>Support, confidence and lift</h2></div><button className="secondary-button" onClick={() => setMinLift((current) => current === 2 ? 3 : current === 3 ? 5 : 2)}><Filter size={15} /> min lift {minLift.toFixed(1)}</button></div><div className="rules-list">{visible.map((rule, index) => <div className="rule-row" key={`${rule.then}-${index}`}><div className="rule-number">{String(index + 1).padStart(2, "0")}</div><div className="rule-logic"><div>{rule.when.map((condition) => <span key={condition}>{condition}</span>)}</div><ArrowDownRight size={20} /><strong>{rule.then}</strong></div><div className="rule-metrics"><span><small>Support</small><b>{(rule.support * 100).toFixed(1)}%</b></span><span><small>Confidence</small><b>{(rule.confidence * 100).toFixed(1)}%</b></span><span><small>Lift</small><b>{rule.lift.toFixed(2)}×</b></span><i><span style={{ width: `${Math.min(100, rule.confidence * 100)}%` }} /></i></div></div>)}</div></article><p className="r-note"><span>R</span><b>Companion arules experiment included</b> · Python Apriori + FP-Growth artifacts generated · minimum support {(analytics.association.minSupport * 100).toFixed(1)}%</p></section>;
}

function Methodology({ analytics }: { analytics: Analytics }) {
  const clustering = Object.entries(analytics.clustering.algorithms);
  return <section className="workspace-panel"><div className="workspace-hero"><span className="eyebrow">Data methodology</span><h1>Every number has a lineage.</h1><p>The repository includes raw and clean datasets, ETL code, a physical SQLite warehouse, model outputs, R and WEKA experiments, and Power BI-ready data.</p></div><div className="method-grid"><article className="panel"><span className="eyebrow">KDD pipeline</span><h2>From friction to knowledge</h2><div className="method-flow">{["Raw collection", "Cleaning", "Transformation", "Warehouse", "Mining", "Evaluation", "Dashboard"].map((item, index) => <span key={item}><b>{index + 1}</b>{item}</span>)}</div></article><article className="panel"><span className="eyebrow">Data quality</span><h2>ETL audit</h2><dl><div><dt>Raw rows</dt><dd>{analytics.dataQuality.rawRows}</dd></div><div><dt>Clean rows</dt><dd>{analytics.dataQuality.cleanRows}</dd></div><div><dt>Missing after ETL</dt><dd>{analytics.dataQuality.missingAfter}</dd></div><div><dt>Sampling output</dt><dd>10%</dd></div></dl></article><article className="panel"><span className="eyebrow">Clustering evaluation</span><h2>Three methods + anomalies</h2>{clustering.map(([name, result]) => <p className="method-result" key={name}><b>{name}</b><span>{result.clusters} clusters</span><span>silhouette {result.silhouette ?? "n/a"}</span></p>)}</article><article className="panel"><span className="eyebrow">Warehouse architecture</span><h2>Decision-support layer</h2><p className="method-copy">Star and snowflake schemas, surrogate keys, an SCD-ready location dimension, fact/dimension joins, data marts and documented roll-up, drill-down, slice, dice and pivot queries.</p></article></div></section>;
}

export default function Home() {
  const [launched, setLaunched] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [baseComplaints, setBaseComplaints] = useState<Complaint[]>([]);
  const [userComplaints, setUserComplaints] = useState<Complaint[]>([]);
  const [lastSubmitted, setLastSubmitted] = useState<Complaint | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dateDays, setDateDays] = useState(30);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const loaded = useRef(false);
  const complaints = useMemo(() => [...new Map([...userComplaints, ...baseComplaints].map((item) => [item.id, item])).values()], [userComplaints, baseComplaints]);
  const titles: Record<View, [string, string]> = { overview: ["Campus pulse", "Derived from the reproducible warehouse."], explore: ["Issue explorer", "Slice, filter and drill into clean records."], models: ["Model lab", "Compare trained models on one holdout split."], rules: ["Pattern rules", "Inspect rules mined from real transactions."], methodology: ["Data methodology", "Audit lineage, preprocessing and evaluation."] };

  useEffect(() => {
    const stored = localStorage.getItem("campuslens:user-complaints:v2");
    if (stored) { try { const parsed = JSON.parse(stored); window.setTimeout(() => setUserComplaints(parsed), 0); } catch { localStorage.removeItem("campuslens:user-complaints:v2"); } }
  }, []);
  useEffect(() => {
    if ((!launched && !reportOpen) || loaded.current) return;
    loaded.current = true;
    Promise.all([
      fetch("/data/complaints.json").then((response) => response.json()) as Promise<Complaint[]>,
      fetch("/api/complaints").then((response) => response.json()).then((result) => result.complaints as Complaint[]).catch(() => []),
    ]).then(([synthetic, community]) => setBaseComplaints([...community, ...synthetic])).catch(() => setBaseComplaints([]));
  }, [launched, reportOpen]);

  function submitted(complaint: Complaint) {
    setUserComplaints((current) => { const next = [complaint, ...current]; localStorage.setItem("campuslens:user-complaints:v2", JSON.stringify(next)); return next; });
    setLastSubmitted(complaint); setToast(true); window.setTimeout(() => setToast(false), 7000);
  }
  const confirmationToast = toast && lastSubmitted && <div className="toast intelligence-toast" role="status"><span><Check size={17} /></span><div><b>{lastSubmitted.id} analysed</b><p>Stored as {lastSubmitted.category} · model predicted {lastSubmitted.predictedCategory} ({lastSubmitted.confidence}%) · {lastSubmitted.predictedRisk} risk</p>{Boolean(lastSubmitted.duplicateCount) && <small>{lastSubmitted.duplicateCount} similar report{lastSubmitted.duplicateCount === 1 ? "" : "s"} detected</small>}</div><button onClick={() => setToast(false)} aria-label="Dismiss"><X size={16} /></button></div>;
  if (!launched) return <><Landing onEnter={() => setLaunched(true)} onReport={() => setReportOpen(true)} onNavigate={(next) => { setView(next); setLaunched(true); }} />{reportOpen && <ReportModal complaints={complaints} onClose={() => setReportOpen(false)} onSubmitted={submitted} />}{confirmationToast}</>;
  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}><div className="brand"><LogoMark /><span><b>Campus</b>Lens</span></div><p className="sidebar-label">Intelligence</p><nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{view === id && <i />}</button>)}</nav><div className="sidebar-spacer" /><div className="signal-card"><span><Activity size={16} /> Reproducible dataset</span><strong>{(analyticsArtifact.datasetCount + userComplaints.length).toLocaleString()}</strong><p>reports available</p><div><i /><i /><i /><i /><i /></div><small>Seed 313 · ETL validated</small></div><Link className="sidebar-problem" href="/problem-statement"><Target size={17} /> Problem statement</Link><button className={`sidebar-help ${view === "methodology" ? "active" : ""}`} onClick={() => { setView("methodology"); setMobileNav(false); }}><MessageSquareWarning size={17} /> Data methodology</button><div className="campus-select"><span className="avatar">J62</span><div><b>JIIT Sector 62</b><small>Noida campus</small></div></div></aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="main-content"><header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><span className="eyebrow">{titles[view][0]}</span><h2>{titles[view][1]}</h2></div></div><div className="top-actions"><button className="date-button" onClick={() => setDateDays((current) => current === 7 ? 30 : current === 30 ? 90 : current === 90 ? 0 : 7)}><CalendarDays size={16} /> {dateDays ? `Last ${dateDays} days` : "All time"} <ChevronDown size={15} /></button><div className="notification-wrap"><button className="icon-button bell" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((current) => !current)}><Bell size={18} /><i /></button>{notificationsOpen && <div className="notification-popover"><b>{analyticsArtifact.criticalCount} critical records</b><p>{analyticsArtifact.clustering.outlierCount} anomalies require review.</p><button onClick={() => { setView("explore"); setNotificationsOpen(false); }}>Inspect records</button></div>}</div><button className="primary-button" onClick={() => setReportOpen(true)}><Plus size={18} /> Report an issue</button></div></header><div className="content-wrap">{view === "overview" ? <Overview complaints={complaints} analytics={analyticsArtifact} onNavigate={setView} /> : view === "explore" ? <Explore complaints={complaints} dateDays={dateDays} /> : view === "models" ? <Models analytics={analyticsArtifact} /> : view === "rules" ? <Rules analytics={analyticsArtifact} /> : <Methodology analytics={analyticsArtifact} />}</div></section>
    {reportOpen && <ReportModal complaints={complaints} onClose={() => setReportOpen(false)} onSubmitted={submitted} />}{confirmationToast}
  </main>;
}
