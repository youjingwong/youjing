# Editor toolbar redesign brief

## Implementation prompt

Redesign the Palang IC desktop editor from a blank structural model rather than preserving the existing wrapping toolbar. Keep three permanent columns: Front editor, Back editor, and Export. Within each document card, add an explicit Image/Watermark target switch and show only the selected target's contextual controls. Build rotation and zoom/size as indivisible compound controls; related buttons, sliders, and values must never split across lines. Separate image adjustments from file actions, move secondary actions into an accessible overflow menu, use one consistent SVG icon family, and never reuse rotate/undo icons for reset. Keep the two watermark text lines and crossing lines as one transformable watermark item. Support light, dark, and device themes with deterministic layouts at both 1440×900 and 960×680. Preserve existing editing, persistence, export, keyboard, pointer, and trackpad behavior.

## First-principles rules

1. Front and Back use the same control model and visual hierarchy.
2. A visible Image/Watermark switch answers “what am I editing?” before any controls appear.
3. Only the selected target's controls are shown.
4. Rotation, zoom, and size are atomic compound controls with their current value in the centre.
5. Rotate glyphs are used only for rotation. Restore defaults is a labelled action with a distinct icon.
6. Crop is a primary image-editing action. Replace, Paste, and Remove are file actions in one menu.
7. Advanced watermark settings open as a side-local overlay and never push one preview out of alignment with the other.
8. Export remains a visually separate inspector with descriptive SVG actions instead of Unicode symbols.

## Reference patterns

- [Apple Photos](https://support.apple.com/en-gb/guide/photos/pht13f0918f0/mac) uses focused editing modes and keeps Crop geometry controls together.
- [Adobe Lightroom](https://helpx.adobe.com/lightroom/desktop/edit-photos/crop-rotate-geometry.html) places Crop, Rotate, Flip, aspect, and geometry in one contextual tool family.
- [Figma](https://help.figma.com/hc/en-us/articles/360039832014-Design-Prototype-and-view-Code-in-the-Properties-Panel) separates global tools from contextual properties and supports visible property labels.
- The [WAI-ARIA toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) informs the semantic grouping and keyboard-accessible control labels.

## QA inventory

- Front, Back, and Export are visibly distinct columns at normal and minimum window sizes.
- Front and Back expose matching Image and Watermark modes.
- Image mode contains Crop, one rotation group, one zoom group, and one file-actions menu.
- Watermark mode contains the two-line text field, one size group, one rotation group, colour, and More settings.
- Each rotation cluster stays on one line and displays its degree value.
- Reset watermark is labelled and does not use a rotate, undo, or redo icon.
- Switching modes does not mutate either side's state.
- Front and Back edits remain isolated; copying watermark settings does not copy image settings.
- Advanced settings overlay the local card without moving either preview.
- All controls remain usable in light, dark, and device modes at 1440×900 and 960×680.
- Exploratory checks: open both side menus at the minimum size; switch modes after rotating/zooming and verify values remain stable.
