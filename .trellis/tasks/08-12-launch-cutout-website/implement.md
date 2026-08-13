# Launch Cutout official website - implementation plan

## 1. Product site

- [ ] Create the standalone static document, stylesheet and small progressive
      enhancement script under `website/`.
- [ ] Prepare reviewed Cutout brand/product evidence as responsive web assets.
- [ ] Implement product-first hero, dynamic production journey, output gallery,
      local trust boundary and verified-release CTA/footer.
- [ ] Add canonical, social, structured-data, favicon, robots and security metadata.

## 2. Verification

- [ ] Add and run a deterministic website validator.
- [ ] Run a local static server and Playwright checks at mobile, tablet, desktop
      and wide viewports, including overflow, keyboard and reduced motion.
- [ ] Inspect screenshots and canvas pixels; fix every visual/content defect.
- [ ] Run existing repository lint/build and scoped diff checks.

## 3. Deployment

- [ ] Add a least-privilege GitHub Actions workflow for Vercel deploy, custom
      domain binding, Cloudflare DNS upsert and exact-revision production smoke.
- [ ] Confirm the required organization secrets/variables are available to the
      Cutout repository without reading their values.
- [ ] Commit and push the website revision to `main`, run the deploy workflow and
      verify `https://cutout.nebutra.com` on desktop/mobile.

## Final gate

- [ ] Every PRD acceptance criterion has direct local or production evidence.
- [ ] Website deployment does not imply the in-progress desktop candidate has
      passed its separate packaged E2E/release gate.
