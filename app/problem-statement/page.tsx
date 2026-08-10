import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BarChart3, EyeOff, Layers3, MapPin, MessageSquareWarning, TimerReset } from "lucide-react";

export const metadata: Metadata = {
  title: "Problem Statement — CampusLens",
  description: "Why fragmented campus complaints hide recurring operational problems, and the research problem CampusLens addresses.",
};

const blindSpots = [
  { number: "01", icon: MessageSquareWarning, title: "Reports stay isolated", text: "A slow network report, a failed projector and a crowded corridor enter different channels. Nobody sees the pattern connecting them." },
  { number: "02", icon: MapPin, title: "Place loses meaning", text: "Flat forms record a building name but rarely preserve the campus → zone → floor → room hierarchy needed for real drill-down." },
  { number: "03", icon: TimerReset, title: "Time is discarded", text: "A recurring 10 AM failure looks identical to a one-off incident when hour, weekday, occupancy and recurrence are not analysed together." },
  { number: "04", icon: EyeOff, title: "Priority becomes guesswork", text: "Teams react to the loudest complaint instead of the highest-risk cluster, emerging anomaly or strongest repeated signal." },
];

export default function ProblemStatementPage() {
  return <main className="problem-page">
    <nav className="problem-nav" aria-label="Problem statement navigation">
      <Link className="problem-brand" href="/"><span className="problem-mark"><i /></span><span><b>Campus</b>Lens</span></Link>
      <Link className="problem-back" href="/"><ArrowLeft size={16} /> Back to platform</Link>
    </nav>

    <header className="problem-hero">
      <div className="problem-kicker"><span>01</span><p>The institutional blind spot</p></div>
      <h1>The campus is speaking.<br /><em>We are not listening.</em></h1>
      <p className="problem-intro">Every day, students experience hundreds of small failures. Most appear unrelated. Together, they describe the operational health of the campus.</p>
      <div className="problem-visual">
        <Image src="/images/brand/campus-friction-collage.webp" alt="College students experiencing disconnected systems, crowded corridors, canteen queues and projector failure" fill priority sizes="(max-width: 760px) 100vw, 92vw" />
        <div className="problem-visual-label"><span>Signal 001—004</span><p>Four complaints.<br />One hidden system.</p></div>
      </div>
    </header>

    <section className="problem-thesis">
      <div><span className="problem-section-number">02 / The problem</span><h2>Campuses collect complaints.<br />They do not collect <em>knowledge.</em></h2></div>
      <div className="problem-copy"><p>Conventional complaint portals are designed for ticket closure: receive an issue, assign it, mark it resolved. They answer <b>“Was this complaint handled?”</b></p><p>They do not answer the more valuable questions: <b>Which problems recur? Where do they concentrate? When do they peak? What factors appear together? Which weak signal is becoming the next major failure?</b></p></div>
    </section>

    <section className="blindspot-grid" aria-label="Four structural blind spots">
      {blindSpots.map(({ number, icon: Icon, title, text }) => <article key={number}><div><span>{number}</span><Icon size={22} /></div><h3>{title}</h3><p>{text}</p></article>)}
    </section>

    <section className="research-statement">
      <div className="research-orbit" aria-hidden="true"><i /><i /><i /><b /></div>
      <span className="problem-section-number">03 / Research statement</span>
      <blockquote>How can heterogeneous, anonymous campus reports be transformed into reliable multidimensional intelligence that reveals recurring friction, spatial and temporal hotspots, associated conditions, emerging anomalies and likely operational risk?</blockquote>
    </section>

    <section className="problem-shift">
      <div className="shift-heading"><span className="problem-section-number">04 / The shift</span><h2>From anecdotes<br />to evidence.</h2></div>
      <div className="shift-steps">
        <div><span>Input</span><b>Text · image · place · time · severity</b><Layers3 /></div>
        <div><span>Mining</span><b>Classify · cluster · associate · detect</b><BarChart3 /></div>
        <div><span>Decision</span><b>Prioritise · investigate · intervene</b><ArrowUpRight /></div>
      </div>
    </section>

    <section className="problem-outcome">
      <p>CampusLens reframes complaint management as a campus-friction intelligence problem.</p>
      <h2>See the pattern.<br /><span>Fix the system.</span></h2>
      <div><Link href="/">Explore the intelligence platform <ArrowUpRight size={18} /></Link><small>JIIT Sector 62 · Academic data-mining implementation</small></div>
    </section>
  </main>;
}
