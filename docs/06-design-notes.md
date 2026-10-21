# 06 - Design notes

## Reference (a PayPen dashboard shot, kept locally and not redistributed) - used as inspiration only
The PayPen dashboard is a mood and structure reference, not a template to copy. Ideas taken:
a labelled left menu with a clear active marker; a top bar with search, notifications and profile; a dark welcome banner;
a side panel for balances; calm, readable tables. Everything visual below is ProofPay's own.

## ProofPay identity
| Element | Choice | Why |
|---|---|---|
| Palette | warm "paper" off-white, deep blue-black ink, one **verification teal** accent | trust and calm, distinct from the usual cool-grey/blue fintech look |
| Money colours | **held = amber, paid = teal, returned = slate blue**, used identically everywhere (rail, money card, bar, ledger) | the product is about where money is, so colour encodes it |
| Type | **Fraunces** (serif) for page titles, hero and big numbers; **Manrope** for UI | editorial and premium; both self-hosted, no external requests |
| Brand mark | a notched **proof stamp** with a check | the product literally stamps work as proven; reused in the hero receipt |
| Hero | dark banner + a live-looking **verification receipt** with a "PROOF VERIFIED" stamp | shows what the product does instead of clip-art |
| Shapes | 10-14px radii, 1px hairlines, almost no shadow | quiet and precise |

## Layout
- Sticky left sidebar (Menu, Quick links, test-environment note) + sticky top bar (title, search, theme toggle, bell, profile) + page body.
- Overview: full-width hero, "Post a job" form beside a right rail (Money at a glance, Spending guardrails, last update), full-width jobs table, a 4-step "How it works".
- Job page: stepper, action card, contract, verification, dark Money card, audit trail.
- Footer on every page. The page scrolls normally; the sidebar and top bar stay put; a back-to-top button appears after scrolling.
- Under 1000px the sidebar becomes a bottom tab bar and the rail stacks under the content.

## Light / dark mode
- Toggle in the top bar (sun/moon). First visit follows the system preference; an explicit choice is saved in `localStorage` and wins afterwards.
- A tiny inline script in `index.html` sets `data-theme` before first paint, so there is no flash of the wrong theme.
- All colours are CSS tokens defined for `:root` and `[data-theme='dark']`. The AG Grid ledger is re-themed to match in both modes (checked by a test that reads the grid's real background colour).
- Dark mode is a considered palette (ink-teal, brighter teal accent, amber/blue tuned for contrast), not an inversion.

## Accessibility
Landmarks (`navigation`, `main`, `contentinfo`), `aria-current` on the active page, labelled controls, visible focus rings, status never conveyed by colour alone,
`prefers-reduced-motion` respected, theme toggle announces its target ("Switch to dark mode").

## Lessons learned while designing
- Reading reference images too literally produced a near-copy; the second pass started from the product's own idea (proof, money states) instead.
- Screenshots exposed a cramped hero and truncated job names; fixed by letting the hero and table span the full width and putting the rail beside the form only.
- A CSS class collision and a mid-transition colour read in a test were both caught by the browser tests.

## Round 3: minimal pass (user feedback)
Feedback: the right panel floated over other sections on scroll; preset example jobs and a hard-coded $45 budget should go; the hero should show the logo,
not a sample job; and the dark theme felt like generic "AI slop".
- **Bug:** the right rail used `position: sticky`; its containing block was the whole page grid, so it slid over the jobs table. It is now in normal flow (regression test measures its document position before and after scrolling).
- **Form:** no preset chips, the budget starts empty with the placeholder "e.g. 50.00" and cannot be submitted blank. The text box grows so the card matches the panel beside it.
- **Hero:** plain bordered section with the shield-and-check logo (the earlier mark, restored everywhere: sidebar, footer, favicon). No sample receipt.
- **Flatter, quieter:** removed the gradient glows and the dark-teal banner/money card; dark mode is neutral graphite (`#0f1012` / `#151618`) instead of blue-black; one typeface (Manrope), no serif.
- **Colour is meaning, not decoration:** primary buttons are monochrome (ink in light, near-white in dark). Teal marks verified/paid, amber marks held, blue marks returned, red/amber for problems.

## Round 4: polish + new capabilities (user feedback)
- **Post-a-job card** was leaving dead space under it. It now stretches to the height of the money panels beside it and the description box grows to absorb the space (browser tests assert equal heights and a small gap).
- **Collapsible sidebar:** a button in the sidebar header hides it with a horizontal slide; the page widens; a button in the top bar (and the shield tile) brings it back. The choice is saved. Under 1000px the sidebar is a bottom tab bar instead.
- **Frosted-glass top bar:** a floating bar with ~38% opaque surface, `blur(26px) saturate(190%)`, a bright inner edge and soft shadow (tuned separately for dark mode). A test checks it is translucent with a strong blur.
- **Brand lockup:** the shield is back, now as a proper lockup: ink tile + "**Proof**Pay" wordmark (weight contrast) + "VERIFIED PAYMENTS" tagline, used in the sidebar, footer and as a large brand card in the hero (mark, wordmark, tagline, Hold / Prove / Release).
- **Images + voice in the description** (previously "future scope", now built): see README. Voice is feature-detected and degrades gracefully. Images are validated server-side by file signature.

## Round 5: form spacing + premium emblem (user feedback)
- **Post a job spacing was a blunder:** the description box was stretched into a huge empty void and the vertical rhythm was inconsistent (16 / 7 / 16px, a full-width field for a short number).
  Redesigned as one calm block: **22px between blocks, 9px label-to-control**; the text box has a fixed sensible height (150px) and is never stretched; the image drop zone is a proper dashed zone
  (empty state with icon + Browse, thumbnails + "Add more" when filled); **Budget and Create contract share one row**; the helper note sits under them. The card still matches the panels beside it in height
  (the action row is pushed to the bottom, so any spare space becomes breathing room above the button, never a void). A browser test asserts every gap between blocks <= 48px and the text box <= 200px tall.
- **Brand artwork is graphic, not text:** my previous brand card added a tagline and Hold/Prove/Release chips. It is now an emblem only: a bevelled metal-look shield with a check, fine **guilloche rings and rays**
  (banknote-security pattern, faded at the edges), a slowly rotating notched **stamp ring**, and a teal **verification arc**. The only text is the ProofPay wordmark. It adapts to dark mode (silver shield, dark check).
  A test asserts the brand card's text is exactly "ProofPay". The sidebar and footer lockups also lost the "Verified payments" tagline.

## Round 6: 3D brand card + compact right rail (user feedback)
- **3D brand card.** The hero emblem is now a small scene (`BrandStage.tsx`): five depth layers (guilloche rings z0, stamp ring + teal arc z26, contact shadow z10, shield z64, wordmark z42) inside a `perspective: 1100px` container.
  The card tilts up to 11 degrees toward the pointer (rotateX/rotateY from the cursor position), the layers parallax against each other, the shadow slides opposite to the tilt, a soft glare follows the cursor, and the card lifts with a deeper shadow.
  With no pointer the shield floats gently and the stamp ring turns very slowly; on leave the card eases back to flat. Touch input and `prefers-reduced-motion` get the static artwork (tilt, float and glare are switched off).
- **Right rail.** "Last update" removed entirely. "Money at a glance" is a 2x2 grid (Held / Paid / Returned / Contracts) with "Spending guardrails" directly beneath, so the rail is ~25% shorter.
- **Post a job resized to match.** Spacing tightened (20px between blocks, 26px padding, 116px text box) and rail cards padded to 22px so the two columns are naturally the same height (536px vs 535px), not stretched. A test asserts they end level and that there is no filler gap inside the guardrails card.
- Bug found on the way: with only absolutely positioned layers the card had no intrinsic width and collapsed to 2px, spilling the pattern off-screen (the existing no-horizontal-overflow screenshot assertions caught it). The hero column now has a fixed width.

## Round 7: the whole logo as a solid 3D object (user feedback)
- **Removed** the green verification arc and the cursor glare (the white highlight on hover). Hover now keeps only the tilt/parallax and the lift shadow; a test asserts no glare element, no brand-coloured arc, and no radial-gradient overlay while hovering.
- **Solid shield:** built from 14 stacked slices (1.7px apart, ~24px thick) in a darker side colour plus a lit front face, so the side wall is visible when it tilts; the check mark is raised from the face (4 edge slices + a top face).
- **Extruded wordmark:** six stacked hard text-shadows whose direction follows the tilt, with a soft contact shadow.
- **Resting pose:** the scene sits at a slight angle (8deg / -14deg) so the depth is visible without touching it; hover adds up to 11deg and the card eases back to the resting pose on leave. Touch and `prefers-reduced-motion` keep the resting pose with no motion.
- Themes: near-black shield with a light raised check in light mode; silver shield with a dark raised check in dark mode.

## Round 8: floor shadow removed
The flat contact-shadow ellipse under the shield could not stay aligned with a rotating 3D object, so it was removed (layer, CSS and SVG ellipse). The shield now floats, defined by its own lit front face and side wall. A test asserts no `.l-shadow` layer or ellipse exists in the brand card.

## Round 9: device-general layout (user feedback: ugly on phones)
Reported on a phone: mismatched blocks, text out of bounds, "sidebar randomly on the page". Instead of guessing, every page and every job state was loaded at real sizes (320, 375, 412, 768 wide, phone landscape, tablet landscape) and measured.
**Root causes found**
- The "random sidebar" was the phone bottom tab bar stuck at the *desktop sidebar's width* (252px) because later desktop rules overrode the earlier mobile rules (CSS cascade order). Its three items need ~380px, so they were clipped, and on a 320px phone they made the page 37px wider than the screen. The bar also still showed the brand block, and a "collapsed sidebar" choice saved on desktop could hide it entirely on a phone.
- "Create contract" was cut off (same cascade problem on the Budget row); the progress stepper broke into two rows; the drop zone text was cramped; grid columns sized to the longest unwrapped title widened the whole page ("Needs your attention" box at 320px).
**Fix**
- One authoritative responsive section **at the end of the stylesheet** (breakpoints 1240 / 1000 / 640 / 380) that resets every desktop sizing rule explicitly; the old scattered mobile rules were removed.
- Phones/tablets (<=1000px): frosted bottom tab bar, full width, pinned, safe-area aware, always shown (the desktop collapse setting is ignored); floating glass top bar with the search on its own row; brand card shown centred under the hero; single-column pages; compact 4-step stepper; stacked job cards; full-width action buttons; scrollable filter chips; bounded grid columns.
- Touch: 40-44px tap targets on coarse pointers, 16px form fields (no iOS zoom on focus), `viewport-fit=cover`, toasts and back-to-top lifted above the bar.
**Regression tests** (`e2e/responsive.spec.ts`, 17): all pages and job states at 6 screen sizes have no horizontal overflow, no out-of-bounds elements, no clipped text, no small tap targets; the bottom bar is full width, pinned and unmoved while scrolling and never covers the footer; the saved-collapse case; 1024 landscape keeps the sidebar; the smallest phone can create a contract by touch; search is reachable; dark mode fits.
