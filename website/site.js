const stages = {
  intent: {
    kicker: 'Intent model',
    title: 'Start with the outcome, not a template.',
    copy: 'Cutout reads the business scenario, source material, platform, audience, and constraints before it decides what should be made.',
    evidence: [
      'Natural-language brief and source references',
      'Domain-aware scope and capability check',
      'No hardcoded route or material count',
    ],
    activeNode: 'input',
  },
  systems: {
    kicker: 'Design System candidates',
    title: 'Compare coherent directions before committing.',
    copy: 'The Agent can plan multiple distinct systems when the intent benefits from choice. Each candidate owns tokens, visual language, rationale, and downstream route compatibility.',
    evidence: [
      'Candidate count follows intent',
      'Tokens and DESIGN.md stay consumable',
      'Selection persists in authoritative Design IR',
    ],
    activeNode: 'plan',
  },
  routes: {
    kicker: 'Complete route suites',
    title: 'Let the business domain shape the route graph.',
    copy: 'A restaurant, a game, and a desktop tool need different journeys. Cutout plans every route required by the scenario instead of forcing a fixed landing-page funnel.',
    evidence: [
      'Domain-specific information architecture',
      'Cross-page visual consistency',
      'Per-page generation and review state',
    ],
    activeNode: 'plan',
  },
  assets: {
    kicker: 'Semantic visual production',
    title: 'Make only the assets that carry real reuse value.',
    copy: 'Cutout derives the material plan from the art direction and page semantics, generates or deconstructs the source, then validates dimensions, alpha, fidelity, and duplicates.',
    evidence: [
      'Art-directed non-UI assets',
      'Semantic slices instead of fixed quotas',
      'Hash, dimensions, and quality evidence',
    ],
    activeNode: 'output',
  },
  deliver: {
    kicker: 'Evidence-backed delivery',
    title: 'Deliver a package another tool can actually consume.',
    copy: 'Design Markdown, tokens, route evidence, resource packs, content hashes, provenance, and approvals stay bound to the same reviewed revision.',
    evidence: [
      'Design and brand kits',
      'Versioned resource packs',
      'Preview and approval boundaries preserved',
    ],
    activeNode: 'output',
  },
};

const stageButtons = [...document.querySelectorAll('[data-stage]')];
const title = document.querySelector('[data-stage-title]');
const kicker = document.querySelector('[data-stage-kicker]');
const copy = document.querySelector('[data-stage-copy]');
const evidence = document.querySelector('[data-stage-evidence]');
const graphNodes = [...document.querySelectorAll('.graph-node')];

function selectStage(button) {
  const stage = stages[button.dataset.stage];
  if (!stage || !title || !kicker || !copy || !evidence) return;

  stageButtons.forEach((candidate) => {
    const selected = candidate === button;
    candidate.classList.toggle('is-active', selected);
    candidate.setAttribute('aria-selected', String(selected));
  });

  kicker.textContent = stage.kicker;
  title.textContent = stage.title;
  copy.textContent = stage.copy;
  evidence.replaceChildren(
    ...stage.evidence.map((item) => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      return listItem;
    }),
  );

  graphNodes.forEach((node) => {
    const active = node.classList.contains(`node-${stage.activeNode}`);
    node.style.borderColor = active ? 'var(--green-bright)' : '';
    node.style.color = active ? 'var(--white)' : '';
  });
}

stageButtons.forEach((button, index) => {
  button.addEventListener('click', () => selectStage(button));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = stageButtons[(index + direction + stageButtons.length) % stageButtons.length];
    next.focus();
    selectStage(next);
  });
});

const mobileNavigation = document.querySelector('.mobile-nav');
mobileNavigation?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => mobileNavigation.removeAttribute('open'));
});

const platform = navigator.userAgentData?.platform || navigator.platform || '';
let downloadLabel = 'Download latest';
if (/Mac/i.test(platform)) downloadLabel = 'Download for macOS';
else if (/Win/i.test(platform)) downloadLabel = 'Download for Windows';
else if (/Linux/i.test(platform)) downloadLabel = 'Download for Linux';

document.querySelectorAll('[data-download-label]').forEach((label) => {
  label.textContent = downloadLabel;
});
