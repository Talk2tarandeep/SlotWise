# Warehouse Digital Twin: 3D Picking Floor Game

NEXAI 2026 Hackathon, PS 4.2. Work in progress; the full README comes in Phase 6.

## Data
Place `online_retail_II.xlsx` (Online Retail II, UCI Machine Learning Repository,
Chen, D. (2012), CC BY 4.0, https://archive.ics.uci.edu/dataset/502/online+retail+ii)
in `data/raw/`.

Definitions: **one order = one Invoice**, **one pick = one order line** (not quantity).
Repeated lines of the same product inside one invoice are merged into one pick,
because the picker visits that slot once.

## Setup
```bash
python3 -m venv .venv
.venv/bin/pip install -r preprocess/requirements.txt
.venv/bin/python preprocess/build_data.py --month 2010-11
npm install
npm run dev
```
