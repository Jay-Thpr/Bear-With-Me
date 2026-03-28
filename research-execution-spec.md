# Research Execution Spec

## Goal

The research system should produce a coach-ready technical understanding of a skill, not a shallow summary.

For each run, the pipeline should answer:

- What does correct technique actually look like?
- What do beginners most often get wrong?
- What progression gets a learner from first rep to stable baseline competence?
- What cues are observable from a webcam?
- What drills fit the learner's time constraint?
- Which source evidence supports each coaching recommendation?

## Intake Inputs

The current primary input surface is:

1. What do you want to learn?
2. What is your skill level?
3. What is your time constraint to learn?

These three fields are enough to start the bounded research run.

## Research Phases

### 1. Intake Normalization

Gemini should normalize the user input into:

- skill
- goal
- level
- available practice time
- inferred environment assumptions
- inferred equipment assumptions
- success criteria

The output of this step should be operational and conservative.

### 2. Research Brief Generation

Gemini should create a brief that defines:

- technique questions to answer
- learner-appropriate progression focus
- what kind of sources to prioritize
- what observable cues matter for live coaching
- what should be ignored as low-value or overly advanced

### 3. Web Research

The web phase should focus on:

- core technique fundamentals
- terminology and canonical movement descriptions
- common beginner errors
- safety considerations
- progression frameworks

Expected output:

- 5 to 8 grounded sources
- a merged set of proper-form cues
- a merged set of common mistakes
- a merged set of progression steps

The research log should record:

- every source title and URL
- what each source contributed
- which proper-form cues came from the source
- which mistakes or safety notes came from the source

### 4. YouTube Research

The video phase should focus on:

- finding tutorial videos that show clear technique
- analyzing at least 3 strong candidates
- extracting teachable moments and timestamped references

Expected output:

- top videos ranked for usefulness
- key techniques demonstrated in each
- common mistakes shown in each
- timestamps for best reference moments

The research log should record:

- each selected video title and URL
- why it was included
- key timestamps
- specific technique notes from the analysis

### 5. Synthesis

The final synthesis should convert evidence into a coaching model with:

- proper form
- common mistakes
- progression order
- safety considerations
- coaching strategy
- session plan
- source-backed references

The synthesis should be specific enough that the live coach can:

- detect what to look for on camera
- choose one correction at a time
- know what “good enough” looks like for the current learner

## Google Doc Behavior

The research doc should contain two tabs:

1. `Research Log`
2. `Final Research`

### Research Log

This tab should be verbose and evidence-rich.

It should include:

- learner intake snapshot
- research brief
- every major retrieval action
- web sources reviewed
- video sources reviewed
- extracted findings per source
- synthesis checkpoints
- doc write failures if any

This tab is the audit trail.

### Final Research

This tab should be clean and stable.

It should include:

- overview
- learner profile
- proper form
- common mistakes
- progression order
- safety considerations
- session plan
- source appendix
- per-video technique notes

Only `Final Research` should be used for context injection.

## UI Expectations During Research

The research-loading page should show:

- the current active research target in the center panel
- the rolling status feed
- a link to the live Google Doc
- a link to the Drive folder

The active research target should be updated as the pipeline moves through:

- workspace creation
- learner profile parsing
- brief generation
- grounded web retrieval
- video analysis
- synthesis
- final write

## Current Gap

The current implementation still does a shallow run:

- one bounded web synthesis
- up to three videos
- one synthesis pass

That is enough for a functional demo, but not enough for a real technique-first coaching system.

## Next Upgrade Direction

The next research upgrade should add:

1. richer per-source logging
2. deeper extraction from grounded web sources
3. stronger video ranking and timestamp capture
4. more robust final research formatting
5. explicit source-to-technique traceability
