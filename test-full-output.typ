= Product Overview

The Triton2 is a professional-grade, high-resolution capacitive sensing solution designed for precise water level monitoring in demanding industrial environments.

== Key Features

- *Quad-Channel Architecture:* Supports up to four independent measurement probes simultaneously.
- *High-Resolution Sensing:* Utilizes a 32-bit sampling engine capable of detecting minute changes in capacitance (sub-pF resolution).

= Connection Interface

The sensor communicates via *RS485* using the Modbus RTU protocol.

#table(
  columns: (1fr, 1fr),
  inset: 10pt,
  align: horizon,
  [*Signal*],
  [*Description*],
  [*A / D+*],
  [Modbus RS485 Positive],
  [*B / D-*],
  [Modbus RS485 Negative],
)

= Modbus Register Map

#table(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr),
  inset: 10pt,
  align: horizon,
  [*Address*],
  [*Size*],
  [*Access*],
  [*Name*],
  [*Data Type*],
  [*Description*],
  [0],
  [1],
  [RO],
  [`STATUS`],
  [uint16],
  [System status bitfield.],
  [6],
  [1],
  [RW\*],
  [`CONFIG`],
  [uint16],
  [Feature enable bitfield (RW in Config Mode).],
)

= Communication Examples

== Reading Measurement Data

```python
raw_response = master.read_holding_registers(slave=1, address=18, count=2)
cal_response = master.read_holding_registers(slave=1, address=26, count=2)

ch1_raw = decode_ieee754(raw_response, byte_order=CDAB)
ch1_cal = decode_ieee754(cal_response, byte_order=CDAB)

```

== Modifying Configuration

```python
master.write_single_register(slave=1, address=10, value=201) # Unlock
master.write_single_register(slave=1, address=8, value=4)    # Set Baud 115200
master.write_single_register(slave=1, address=10, value=202) # Apply & Reboot

```

== Full 2-Point Calibration

```python
# --- STEP 1: Calibrate Point 0 (Empty/Zero) ---
master.write_float32(slave=1, address=56, value=0.0)
master.write_single_register(slave=1, address=10, value=410)
wait_for_cal_act_to_be_zero(slave=1)

# --- STEP 2: Calibrate Point 1 (Full/100) ---
master.write_float32(slave=1, address=56, value=100.0)
master.write_single_register(slave=1, address=10, value=411)
wait_for_cal_act_to_be_zero(slave=1)

```

