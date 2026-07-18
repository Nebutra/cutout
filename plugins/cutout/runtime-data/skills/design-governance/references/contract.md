# Contract

Operations: `governance.preview`, `governance.validate`, `governance.report`.

Preview and validate consume explicit Design IR token usage declarations. Reports contain rule, severity, mode, state, measurements, location, standard version, and evidence identity. Hard failures block promotion; advisories do not. Repair is delegated to `coding.repair` and requires an approval ID for brand-locked changes.
