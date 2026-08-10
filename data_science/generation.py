"""Semantically valid, multi-source synthetic campus benchmark generation."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 313
ROW_COUNT = 2840
CATEGORIES = ["Network", "Infrastructure", "Cleanliness", "Canteen", "Electrical", "Lab Equipment", "Water", "Other"]

LOCATION_MASTER = [
    ("Academic & Teaching", "Aryabhatt Bhawan II", "academic", 28.62970, 77.37290, {"Floor 1": ["CR101", "CR102"], "Floor 2": ["CR201", "CR202"], "Floor 4": ["CR425"]}),
    ("Academic & Teaching", "Aryabhatt Bhawan III", "academic", 28.62990, 77.37315, {"Floor 1": ["CS1", "CS2"], "Floor 2": ["G2", "G3"], "Floor 3": ["FF6"]}),
    ("Academic & Teaching", "A2/1", "academic", 28.63010, 77.37255, {"Ground Floor": ["G1", "G2"], "Floor 1": ["TS11", "TS12"]}),
    ("Academic & Teaching", "A2/2", "academic", 28.63024, 77.37275, {"Ground Floor": ["G5", "G6"], "Floor 1": ["TS17", "TS18"]}),
    ("Labs & Research", "CL1", "lab", 28.62958, 77.37248, {"Ground Floor": ["CL1-A", "CL1-B"]}),
    ("Labs & Research", "CL3", "lab", 28.62964, 77.37261, {"Ground Floor": ["CL3-A", "CL3-B"]}),
    ("Labs & Research", "CL15", "lab", 28.62978, 77.37254, {"Floor 1": ["CL15-A", "CL15-B"]}),
    ("Labs & Research", "CL22", "lab", 28.62986, 77.37266, {"Floor 2": ["CL22-A", "CL22-B"]}),
    ("Labs & Research", "ECE Labs", "lab", 28.62974, 77.37282, {"Floor 2": ["ECE-201", "ECE-202"]}),
    ("Library & Study", "LRC", "library", 28.63002, 77.37302, {"Ground Floor": ["Reading Hall"], "Floor 1": ["Digital Area", "Group Study"]}),
    ("Food", "Annapurna / Main Mess", "food", 28.63042, 77.37312, {"Ground Floor": ["Dining Hall", "Counter A"]}),
    ("Food", "Cafeteria / Canteen", "food", 28.63031, 77.37298, {"Ground Floor": ["Food Court", "Billing Counter"]}),
    ("Hostels", "H4 Boys Hostel", "hostel", 28.63062, 77.37262, {"Ground Floor": ["H4 Common Room"], "Floor 1": ["H4 Corridor 1"], "Floor 2": ["H4 Corridor 2"]}),
    ("Hostels", "H5 Boys Hostel", "hostel", 28.63075, 77.37278, {"Ground Floor": ["H5 Common Room"], "Floor 1": ["H5 Corridor 1"], "Floor 2": ["H5 Corridor 2"]}),
    ("Hostels", "Girls Hostel", "hostel", 28.63087, 77.37294, {"Ground Floor": ["GH Common Room"], "Floor 1": ["GH Corridor 1"]}),
    ("General & Utilities", "Administration Block", "office", 28.62992, 77.37334, {"Ground Floor": ["Reception"], "Floor 1": ["Academic Office"]}),
    ("General & Utilities", "Auditorium", "common", 28.63016, 77.37330, {"Ground Floor": ["Main Hall", "Backstage"]}),
    ("General & Utilities", "Main Gate", "outdoor", 28.62938, 77.37238, {"Outdoor": ["Gate 1", "Security Post"]}),
    ("General & Utilities", "Parking", "outdoor", 28.62945, 77.37222, {"Outdoor": ["Student Parking", "Visitor Parking"]}),
    ("General & Utilities", "Water Points", "utility", 28.63005, 77.37238, {"Ground Floor": ["Cooler A", "Cooler B"]}),
    ("Sports & Recreation", "Sports Complex", "sports", 28.63102, 77.37322, {"Ground Floor": ["Gym", "Indoor Court"], "Outdoor": ["Basketball Court"]}),
    ("General & Utilities", "Washrooms", "utility", 28.62982, 77.37326, {"Ground Floor": ["Washroom G"], "Floor 1": ["Washroom 1"]}),
]

TEMPLATES = {
    "Network": [
        "the campus network drops repeatedly during class", "the wifi signal is unstable for several devices",
        "students cannot authenticate to the wireless network", "internet speed falls below a usable level",
        "the access point disconnects users every few minutes", "online resources time out during the session",
        "network coverage disappears near the back rows", "the wired connection cannot reach institute services",
        "video lectures buffer on the campus connection", "the login portal loops without granting access",
    ],
    "Infrastructure": [
        "the projector loses its input after a few minutes", "several desks have loose or damaged fittings",
        "the classroom door cannot close safely", "the display cable and wall port need repair",
        "a chair is blocking the aisle because its leg is broken", "the writing surface is damaged and difficult to use",
        "ceiling plaster appears loose near the entrance", "the lecture-room screen does not lower correctly",
        "signage for the room is missing", "a window latch is broken and requires maintenance",
    ],
    "Cleanliness": [
        "the area has not been cleaned since the morning", "waste bins are overflowing into the corridor",
        "a spill has made the floor slippery", "the wash area needs urgent sanitation",
        "food waste has accumulated near the seating area", "dust and litter remain around the workstations",
        "the corridor has a persistent hygiene problem", "the cleaning schedule appears to have been missed",
        "standing water is creating an unhygienic patch", "the common area smells unpleasant and needs attention",
    ],
    "Canteen": [
        "the service queue is moving very slowly", "only one billing counter is open during the rush",
        "students are waiting too long for food service", "the queue extends into the walking area",
        "the pickup counter is overcrowded", "billing and collection lines are merging into one queue",
        "seating capacity is insufficient during the meal break", "order processing has stopped at one counter",
        "the lunch rush is blocking the entrance", "waiting time is longer than the scheduled break",
    ],
    "Electrical": [
        "the ceiling fans are not operating", "the air conditioner stops cooling after midday",
        "lights flicker repeatedly during use", "a power socket is loose and unsafe",
        "the room loses power for short intervals", "an electrical panel is making an unusual sound",
        "charging points are unavailable", "the ventilation fan does not start",
        "a switchboard becomes warm during operation", "backup power did not activate during an interruption",
    ],
    "Lab Equipment": [
        "several systems freeze during compilation", "a monitor and keyboard are not detected",
        "the workstation cannot boot for the practical", "laboratory equipment reports a calibration error",
        "installed development tools fail to launch", "the experiment console does not record readings",
        "multiple computers show storage errors", "the device driver is missing from the workstation",
        "the lab printer is unavailable to student systems", "the equipment interface stops responding during use",
    ],
    "Water": [
        "the drinking-water dispenser is empty", "water is leaking into the walking area",
        "water pressure is too low for normal use", "the nearest water point is not operational",
        "the cooler produces warm water only", "a tap continues running after it is closed",
        "the refill indicator has remained empty", "water is collecting beneath the dispenser",
        "the filtration unit shows a service warning", "the supply is unavailable on this floor",
    ],
    "Other": [
        "parking congestion is blocking access", "directional signage is unclear for new students",
        "the common area is overcrowded", "a campus service is unavailable without an explanation",
        "the security queue is delaying entry", "an unattended item is obstructing the walkway",
        "the notice board contains outdated information", "the help desk is closed during published hours",
        "pedestrian movement is restricted by stored material", "the student activity area is unavailable",
    ],
}

STYLE_PREFIX = [
    "please investigate because", "students report that", "during the latest session", "a repeated observation is that",
    "the current problem is that", "staff were informed that", "today we noticed that", "for the second time this week",
    "an urgent maintenance check is needed because", "the class representative confirmed that",
]
CONTEXT = [
    "and it interrupts scheduled teaching", "while the area is moderately occupied", "and the issue lasts more than ten minutes",
    "although nearby rooms remain usable", "and several students are affected", "after normal troubleshooting was attempted",
    "during a regular teaching period", "and the condition has become more frequent", "without any warning notice",
    "while another campus service remains normal", "and staff assistance has been requested", "near the main entrance to the space",
]
CATEGORY_CONTEXT = {
    "Network": "the network service is affected", "Infrastructure": "the physical infrastructure needs attention",
    "Cleanliness": "this is a hygiene and cleanliness concern", "Canteen": "the food service operation is affected",
    "Electrical": "the electrical supply needs inspection", "Lab Equipment": "laboratory equipment availability is affected",
    "Water": "the water service needs attention", "Other": "campus operations are being disrupted",
}


def location_frame() -> pd.DataFrame:
    rows = []
    for zone, facility, kind, latitude, longitude, floors in LOCATION_MASTER:
        for floor, rooms in floors.items():
            for room in rooms:
                rows.append({"campus": "JIIT Sector 62", "zone": zone, "facility": facility, "facility_type": kind,
                             "floor": floor, "room": room, "latitude": latitude, "longitude": longitude})
    return pd.DataFrame(rows)


def _category_weights(kind: str, hour: int, occupancy: int, humidity: int) -> list[float]:
    weights = dict(zip(CATEGORIES, [0.19, 0.16, 0.12, 0.10, 0.12, 0.12, 0.09, 0.10]))
    if kind == "lab": weights["Lab Equipment"] += 0.14
    if kind == "food": weights["Canteen"] += 0.19
    if kind == "hostel": weights["Electrical"] += 0.09; weights["Water"] += 0.07
    if kind == "utility": weights["Water"] += 0.11; weights["Cleanliness"] += 0.09
    if kind == "outdoor": weights["Other"] += 0.14
    if occupancy > 78: weights["Canteen"] += 0.09; weights["Network"] += 0.08
    if humidity > 72: weights["Electrical"] += 0.09; weights["Water"] += 0.07
    if 12 <= hour <= 14: weights["Canteen"] += 0.13
    # Interactions represent probabilistic operating conditions, rather than
    # deterministic facility-to-label mappings. They give the benchmark a few
    # independently testable patterns while preserving substantial overlap.
    if kind == "food" and 12 <= hour <= 14: weights["Canteen"] += 0.70
    if kind == "lab" and occupancy > 78: weights["Network"] += 0.48
    if kind == "hostel" and humidity > 72: weights["Electrical"] += 0.52
    if kind == "utility" and humidity > 72: weights["Water"] += 0.58
    if kind == "academic" and occupancy > 78: weights["Infrastructure"] += 0.38
    total = sum(weights.values())
    return [weights[name] / total for name in CATEGORIES]


def generate_sources(raw_dir: Path, row_count: int = ROW_COUNT, seed: int = SEED) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)
    locations = location_frame()
    start = datetime(2025, 8, 4, 8, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    rows = []
    for index in range(row_count):
        location = locations.iloc[rng.randrange(len(locations))]
        observed = start + timedelta(hours=index * 2 + rng.randrange(0, 2), minutes=rng.randrange(0, 60))
        hour = 8 + rng.randrange(0, 11)
        observed = observed.replace(hour=hour)
        occupancy = int(np.clip(np_rng.normal(60 + (12 if 11 <= hour <= 14 else 0), 18), 5, 100))
        humidity = int(np.clip(np_rng.normal(56, 14), 20, 95))
        true_category = rng.choices(CATEGORIES, weights=_category_weights(location.facility_type, hour, occupancy, humidity), k=1)[0]
        template_index = rng.randrange(len(TEMPLATES[true_category]))
        # Only some independently authored reports contain shared category cues.
        # This avoids both the original unseen-template collapse and an unrealistically
        # perfect keyword task.
        shared_context = CATEGORY_CONTEXT[true_category] if rng.random() < 0.52 else CONTEXT[rng.randrange(len(CONTEXT))]
        text = f"{STYLE_PREFIX[template_index]} {TEMPLATES[true_category][template_index]} in {location.room}; {shared_context}, {CONTEXT[rng.randrange(len(CONTEXT))]} at {hour}:{observed.minute:02d} case {index}"
        recorded_category = rng.choice([value for value in CATEGORIES if value != true_category]) if rng.random() < 0.045 else true_category
        impact = rng.choices([1, 2, 3, 4, 5], [0.16, 0.28, 0.28, 0.19, 0.09], k=1)[0]
        recurring = int(rng.random() < 0.29)
        maintenance_load = float(np.clip(np_rng.normal(0.55, 0.22), 0, 1))
        vendor_delay = float(np_rng.gamma(1.5, 0.7))
        resolution = max(0.5, 1.4 + maintenance_load * 4.0 + vendor_delay + (6 - impact) * 0.28 + recurring * 0.55 + rng.gauss(0, 0.85))
        seeded_anomaly = int(rng.random() < 0.025)
        if seeded_anomaly:
            resolution += rng.uniform(6, 12)
            occupancy = int(np.clip(occupancy + rng.choice([-45, 40]), 1, 100))
        severity = "Critical" if impact == 1 else "High" if impact == 2 else "Medium" if impact == 3 else "Low"
        rows.append({
            "complaint_id": f"CL-{10000 + index}", "event_id": f"EV-{observed:%Y%m}-{index // 5:04d}",
            "student_key": f"ANON-{rng.randrange(1, 801):04d}", "complaint_text": text,
            "category": recorded_category, "template_group": f"{true_category}:{template_index}", "evaluation_fold": template_index % 5,
            "campus": location.campus, "zone": location.zone, "facility": location.facility, "facility_type": location.facility_type,
            "floor": location.floor, "room": location.room, "latitude": round(float(location.latitude), 6),
            "longitude": round(float(location.longitude), 6), "day_name": observed.strftime("%A"),
            "hour": hour, "observed_at": observed.isoformat(), "impact_rating": impact, "severity": severity,
            "occupancy_pct": occupancy, "humidity_pct": humidity, "recurring": recurring,
            "status": rng.choices(["Open", "Verified", "In Progress", "Resolved", "Escalated"], [0.22, .16, .23, .33, .06])[0],
            "resolution_hours": round(resolution, 2), "has_image": int(rng.random() < .28),
            "is_seeded_anomaly": seeded_anomaly, "source_system": rng.choices(["mobile", "web", "kiosk"], [.57, .34, .09])[0],
        })
    complaints = pd.DataFrame(rows)
    # Quality defects are independent of the target label.
    complaints.loc[np_rng.choice(complaints.index, 28, replace=False), "facility"] = np.nan
    complaints.loc[np_rng.choice(complaints.index, 35, replace=False), "occupancy_pct"] = np.nan
    noisy = np_rng.choice(complaints.index, 52, replace=False)
    complaints.loc[noisy, "complaint_text"] = complaints.loc[noisy, "complaint_text"].str.upper() + "   !!!"

    service_rows = []
    routes = ["/report", "/explore", "/campus-map", "/status", "/help"]
    for index in range(row_count * 2):
        location = locations.iloc[rng.randrange(len(locations))]
        observed = start + timedelta(hours=index + rng.randrange(0, 8))
        service_rows.append({"session_id": f"WS-{index:06d}", "route": rng.choice(routes), "facility": location.facility,
                             "search_term": rng.choice(["wifi", "queue", "water", "projector", "cleaning", "parking", "lab"]),
                             "dwell_seconds": max(2, int(np_rng.gamma(2.4, 18))), "converted_to_report": int(rng.random() < .18),
                             "observed_at": observed.isoformat()})
    services = pd.DataFrame(service_rows)
    raw_dir.mkdir(parents=True, exist_ok=True)
    complaints.to_csv(raw_dir / "complaints_raw.csv", index=False)
    services.to_csv(raw_dir / "service_events.csv", index=False)
    locations.to_csv(raw_dir / "facility_master.csv", index=False)
    return complaints, services, locations
