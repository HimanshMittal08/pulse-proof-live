# PulseProof Live

Build PulseProof — Real-Time Biological Liveness Detection

Rebuild the entire PulseProof application as a genuinely functional biological liveness analysis application.

This is NOT a mock/demo application.

Do NOT use hardcoded BPM values, hardcoded confidence percentages, random classifications, fake loading animations that produce predetermined results, or simulated analysis results.

Every displayed measurement and verdict must be derived from the user's actual camera input and the actual signal-processing pipeline.

Preserve the existing PulseProof visual identity and UI as closely as possible.

1. PRODUCT PURPOSE

PulseProof analyzes a live camera feed to determine whether there is sufficient evidence of a genuine human biological signal.

The application should use remote photoplethysmography (rPPG) principles:

Camera
→ Face detection
→ Skin-region extraction
→ Temporal RGB signal collection
→ Signal preprocessing
→ rPPG extraction
→ Signal quality analysis
→ Biological consistency analysis
→ Liveness assessment

The application should NOT claim that rPPG alone can mathematically prove that a video is a deepfake.

Use evidence-based language:

LIKELY REAL

LIKELY SYNTHETIC

INSUFFICIENT EVIDENCE

Never force a binary result when the biological evidence is weak.

2. IMPORTANT IMPLEMENTATION RULES

Absolutely prohibited

Do NOT implement:

hardcoded 72 BPM

hardcoded 99.4%

random BPM generation

random confidence

Math.random() for verdicts

fake AI classification

predetermined "Real" result

predetermined "Deepfake" result

mock API response

fake signal graphs

fake waveform data

fake analysis progress

static demo metrics

The result must change based on actual camera input.

If the camera cannot provide enough evidence, return:

INSUFFICIENT EVIDENCE

rather than inventing a result.

3. UI / VISUAL DESIGN

Keep the current PulseProof design language.

The existing application has a dark futuristic cybersecurity/biometric aesthetic.

Preserve:

dark background

neon cyan/blue accents

glassmorphism cards

rounded panels

glowing borders

biometric/security visual language

large central camera/scanner area

analysis status indicators

signal visualization

verdict card

confidence/evidence indicators

Do NOT redesign it into a generic dashboard.

The goal is:

Same PulseProof UI/branding, but replace the fake demo engine with a real analysis engine.

Make it polished and responsive for:

desktop

laptop

mobile

4. APPLICATION FLOW

Create the following complete flow.

SCREEN 1 — Landing / Scanner

Show:

PulseProof

"Real-Time Biological Liveness Detection"

Subtitle:

"Verify human presence through biological signal consistency."

Primary CTA:

Start Verification

Secondary information:

"Your camera feed is analyzed locally whenever possible."

Do not make exaggerated claims such as:

"100% deepfake detection."

5. CAMERA PERMISSION

When the user clicks Start Verification:

Request camera permission.

If permission is denied:

Show a clear error state:

Camera Access Required

Explain how to enable camera permission.

Do not show a fake result.

6. LIVE SCANNER

Display the live camera feed.

Overlay a face scanning frame.

Detect the user's face.

Show live indicators:

Face detected

Face stability

Lighting quality

Signal acquisition

Example:

FACE DETECTED ✓

FACE STABILITY: GOOD

LIGHTING: GOOD

SIGNAL: ACQUIRING

The values must be calculated from actual input.

7. FACE DETECTION

Use a reliable browser-compatible face detection solution.

Prefer:

MediaPipe Face Detection / Face Landmarker

or another well-supported browser-compatible face tracking library.

Requirements:

detect face continuously

obtain face bounding box

track face position

detect excessive movement

identify usable facial skin regions

Do NOT rely on a manually fixed screen region.

8. REGION OF INTEREST

Extract multiple facial regions suitable for rPPG.

Use areas such as:

forehead

left cheek

right cheek

Avoid:

eyes

mouth

hair

background

heavily shadowed areas

For every frame:

Detect face landmarks/bounding box.

Define ROIs relative to face geometry.

Sample pixel information from the ROIs.

Calculate mean RGB values.

Store timestamp + RGB values.

Example data structure:

timestamp
red_mean
green_mean
blue_mean
face_x
face_y
face_width
face_height


Collect a continuous temporal window.

9. SIGNAL ACQUISITION

Do NOT calculate a pulse from a single frame.

Collect enough frames to construct a temporal signal.

Target:

30 FPS where available.

Use approximately:

10–20 seconds of signal acquisition.

Show progress:

SIGNAL ACQUISITION

██████████████░░░░

8.2 / 12 seconds

Allow the duration to adapt depending on signal quality.

10. MOTION ANALYSIS

Calculate face movement between frames.

Track:

x displacement

y displacement

scale changes

landmark stability

Create:

Face Stability Score

If movement is excessive:

pause/restart signal acquisition.

Display:

"Please keep your face steady."

Do not generate a verdict.

11. LIGHTING ANALYSIS

Calculate lighting quality from the facial ROI.

Check:

average brightness

underexposure

overexposure

extreme variance

Return:

GOOD

FAIR

POOR

If lighting is too poor:

show:

"Insufficient lighting for biological signal analysis."

Return:

INSUFFICIENT EVIDENCE

12. rPPG SIGNAL EXTRACTION

Implement actual rPPG processing.

Do not simply display the raw green channel as the final biological signal.

Implement a reasonable browser-compatible rPPG pipeline.

Possible approach:

Extract RGB temporal signals.

Normalize channels.

Detrend.

Band-pass filter around a physiological heart-rate range.

Extract pulse-related component using a suitable method such as:

POS (Plane-Orthogonal-to-Skin)

CHROM

green-channel baseline method as fallback

Prefer POS or CHROM.

Expected heart-rate range:

approximately:

0.7–4.0 Hz

corresponding to:

42–240 BPM

Do not accept values outside a reasonable physiological range.

13. SIGNAL QUALITY

Calculate actual signal quality.

Use measurable features such as:

signal-to-noise ratio

periodicity

spectral peak strength

peak-to-noise ratio

temporal stability

cross-region consistency

Create:

Biological Signal Quality Score

Range:

0–100

This score must be calculated from the signal.

Never hardcode it.

14. HEART RATE ESTIMATION

Estimate BPM from the dominant physiological frequency.

Example:

dominant_frequency = 1.25 Hz

BPM:

1.25 × 60 = 75 BPM

Use a frequency-domain approach such as FFT/Welch PSD where appropriate.

Display:

Estimated Pulse

75 BPM

But only show it if signal quality is sufficient.

If signal quality is poor:

Pulse:

"Not reliable"

Do NOT display a fake BPM.

15. MULTI-REGION CONSISTENCY

This is extremely important.

Analyze:

forehead signal

left cheek signal

right cheek signal

Compare their physiological periodicity.

A genuine biological pulse should demonstrate some spatial consistency across facial skin regions.

Calculate:

Spatial Consistency Score

0–100

Use actual correlation/coherence measurements.

Do not expect identical signals.

Allow reasonable differences caused by lighting and skin geometry.

16. TEMPORAL CONSISTENCY

Divide the acquisition window into smaller segments.

For example:

Segment 1
Segment 2
Segment 3
Segment 4

Estimate pulse-related features independently.

Compare them.

Calculate:

Temporal Consistency Score

0–100

Avoid declaring a person synthetic simply because BPM fluctuates naturally.

The purpose is to detect whether a stable physiological pattern exists.

17. BIOLOGICAL EVIDENCE SCORE

Combine actual measurements:

Biological Evidence Score should consider:

Signal Quality

SNR

Spectral Peak Strength

Spatial Consistency

Temporal Consistency

Motion Stability

Lighting Quality

Example conceptual weighting:

Signal Quality: 25%

Spatial Consistency: 20%

Temporal Consistency: 20%

SNR / Spectral Strength: 20%

Motion Stability: 10%

Lighting Quality: 5%

These are starting values.

Keep the scoring system modular so it can later be calibrated using a real dataset.

Do NOT describe this as a clinically validated score.

18. VERDICT ENGINE

Use THREE outcomes.

LIKELY REAL

Only when:

sufficient signal exists

signal quality is good

biological periodicity is measurable

multiple facial regions show reasonable consistency

temporal consistency is acceptable

Example:

LIKELY REAL

Evidence Strength: 87%

Biological signal detected consistently.

LIKELY SYNTHETIC

Only when there is enough high-quality evidence suggesting biological inconsistency.

Do NOT classify something as synthetic merely because BPM cannot be detected.

Poor camera quality ≠ deepfake.

Use this state conservatively.

INSUFFICIENT EVIDENCE

Use this whenever:

face not detected

insufficient frames

excessive movement

poor lighting

weak rPPG

high noise

inconsistent measurements

camera quality insufficient

Example:

INSUFFICIENT EVIDENCE

Reason:

"Biological signal quality was too weak for a reliable assessment."

This state is essential.

19. CONFIDENCE

Do not call the value:

"99.4% Accuracy"

unless it comes from a validated test dataset.

Instead call it:

Evidence Strength

or

Assessment Confidence

The value must depend on the actual quality of the acquired evidence.

Do not artificially inflate confidence.

20. LIVE SIGNAL GRAPH

Display an actual live rPPG waveform.

The waveform must be generated from the collected camera signal.

Do NOT generate a fake sine wave.

The graph should update in real time.

Show:

rPPG SIGNAL

Signal Quality: 82/100

Pulse: 74 BPM

Only show BPM if sufficiently reliable.

21. ANALYSIS SCREEN

Create a polished analysis screen with:

CAMERA INPUT

↓

FACE DETECTION

↓

ROI EXTRACTION

↓

BIOLOGICAL SIGNAL

↓

SIGNAL QUALITY

↓

CONSISTENCY ANALYSIS

↓

VERDICT

Show each step changing from:

WAITING

to

PROCESSING

to

COMPLETE

based on actual computation.

Never fake the timing.

22. RESULTS SCREEN

Keep the current PulseProof result-card style.

Show:

Verdict

LIKELY REAL

or

LIKELY SYNTHETIC

or

INSUFFICIENT EVIDENCE

Then show:

Evidence Strength
87%

Estimated Pulse
74 BPM

Signal Quality
84%

Spatial Consistency
89%

Temporal Consistency
82%

Face Stability
91%

Lighting
Good

All numbers must be derived from the actual recording.

23. EXPLANATION

Add:

Why this result?

Example for real:

"Consistent pulse-related signal components were detected across multiple facial regions with acceptable temporal stability."

Example for insufficient evidence:

"Camera movement and weak signal quality prevented reliable biological analysis."

Example for synthetic:

"High-quality facial signal acquisition was successful, but expected biological consistency was not observed across the analyzed regions."

Avoid saying:

"100% fake."

Avoid claiming certainty.

24. PRIVACY

Add a Privacy section.

State clearly:

"PulseProof analyzes camera-derived signals for liveness assessment."

"Do not store camera frames unless explicitly enabled."

Prefer local/browser-side processing wherever technically feasible.

Do not upload camera footage to an external server by default.

If any server processing is required:

clearly indicate it

document what is transmitted

avoid storing raw video

25. ERROR HANDLING

Handle:

camera unavailable

permission denied

no face

multiple faces

face too far away

face too close

excessive movement

poor lighting

insufficient signal

browser unsupported

low FPS

camera disconnect

For multiple faces:

"Please ensure only one face is visible."

For low signal:

"Move to a brighter environment and keep your face steady."

26. MULTIPLE FACE SAFETY

Only analyze when exactly ONE face is detected.

If:

0 faces:

WAITING FOR FACE

If:

2+ faces:

MULTIPLE FACES DETECTED

Do not generate a verdict.

27. PERFORMANCE

The application should work in a normal modern browser without requiring an extremely powerful GPU.

Use:

requestAnimationFrame

efficient frame sampling

throttled analysis

Web Workers where useful

typed arrays for signal processing where useful

Do not process every full-resolution frame unnecessarily.

Keep UI responsive.

28. TECHNOLOGY

Use the existing project's stack where practical.

Prefer:

React

TypeScript

Vite

Tailwind CSS

Browser-compatible computer vision libraries.

For signal processing:

Use lightweight JavaScript/TypeScript implementations or suitable browser-compatible packages.

Do not introduce an unnecessary backend if local processing is sufficient.

29. CODE QUALITY

Create clean modules.

Suggested structure:

src/

components/

CameraScanner.tsx

FaceDetection.tsx

SignalGraph.tsx

AnalysisPipeline.tsx

VerdictCard.tsx

MetricsPanel.tsx

hooks/

useCamera.ts

useFaceTracking.ts

useRPPG.ts

lib/

rppg/

signalProcessing.ts

pos.ts

chrom.ts

quality.ts

motion.ts

scoring.ts

types/

biometrics.ts

Keep signal-processing logic independent from UI.

30. TESTING

Add development/test utilities.

Create deterministic signal-processing unit tests.

Test:

bandpass filtering

FFT/PSD

BPM calculation

signal quality

correlation

spatial consistency

temporal consistency

scoring

Do not test the classifier using random numbers.

31. IMPORTANT SCIENTIFIC LIMITATION

The application should clearly distinguish:

Biological liveness evidence

from

Deepfake detection

rPPG evidence can indicate biological consistency, but it is not a guaranteed deepfake detector.

Therefore the product language should say:

"PulseProof provides biological liveness evidence to help assess whether a visual feed is consistent with a live human."

Do NOT claim:

"PulseProof can detect every deepfake."

Do NOT claim:

"Deepfakes cannot contain blood-flow signals."

Do NOT claim:

"100% accurate."

32. FUTURE ML EXTENSION

Structure the code so that a trained ML classifier can later be added.

Create an abstraction:

BiologicalLivenessClassifier

Input:

rPPG features

signal quality

spectral features

spatial consistency

temporal consistency

motion features

Output:

label

confidence

For now, the baseline rule-based biological evidence engine may be used.

The architecture must allow replacing it later with a trained model.

33. DEMO MODE

Do NOT create a fake demo mode.

If a demo/testing mode is absolutely necessary for development, hide it behind a development-only environment flag and make sure it is impossible to activate in production accidentally.

The production application must always use real camera-derived data.

34. LANDING PAGE CLAIMS

Use scientifically defensible messaging.

Main heading:

"Verify Human Presence Through Biology"

Supporting text:

"PulseProof analyzes subtle camera-derived physiological signals to assess biological liveness in real time."

Feature cards:

REAL-TIME

Biological signal analysis directly from camera input.

NON-INTRUSIVE

No wearable sensor required.

EVIDENCE-BASED

Combines signal quality, spatial consistency and temporal consistency.

35. FINAL ACCEPTANCE CRITERIA

The implementation is NOT complete until all of the following are true:

[ ] Camera input works.

[ ] Face detection works.

[ ] Exactly-one-face validation works.

[ ] Face movement is measured.

[ ] Lighting quality is measured.

[ ] Facial ROIs are dynamically extracted.

[ ] RGB temporal samples are collected.

[ ] Actual rPPG signal is calculated.

[ ] Actual filtering is implemented.

[ ] Actual pulse estimation is implemented.

[ ] Actual signal quality is calculated.

[ ] Multiple facial regions are analyzed.

[ ] Spatial consistency is calculated.

[ ] Temporal consistency is calculated.

[ ] Live waveform comes from real signal data.

[ ] No fake waveform exists.

[ ] No hardcoded BPM exists.

[ ] No hardcoded confidence exists.

[ ] No random classification exists.

[ ] No fake API response exists.

[ ] Insufficient Evidence state exists.

[ ] Poor lighting does not automatically mean synthetic.

[ ] No face does not produce a verdict.

[ ] Multiple faces do not produce a verdict.

[ ] UI remains visually consistent with the existing PulseProof design.

[ ] Production build works.

[ ] Application works on desktop browsers.

[ ] Application works on mobile browsers where camera APIs are supported.

[ ] Privacy messaging is present.

[ ] Scientific claims are conservative and defensible.

36. MOST IMPORTANT INSTRUCTION

Do not optimize this application for looking like it works.

Optimize it for actually processing camera data.

If a measurement cannot be reliably obtained:

say that it cannot be reliably obtained.

If biological evidence is weak:

return INSUFFICIENT EVIDENCE.

Never invent a number merely to make the interface look impressive.

Build the application so that the existing PulseProof visual experience is preserved while the underlying detection pipeline is genuinely functional.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pulse-proof-live.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b663538e-8cd8-46b1-93ef-c8a5d5dbda3f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
