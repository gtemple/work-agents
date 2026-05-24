// Edits for components.jsx — adds a hamburger button to TitleBar that the
// mobile media query reveals at narrow widths.

// ─── EDIT 1 ────────────────────────────────────────────────────────────────
// Update the TitleBar component signature to accept an onHamburger callback,
// and render the hamburger as the leftmost element.
//
// BEFORE:
//
//   function TitleBar({ running, queued, totalCost }) {
//     const now = useClock();
//     return (
//       <div className="title">
//         <span className="dots"><i /><i /><i /></span>
//         <span className="crumb">
//           <b>~/agent-manager</b>
//           <span className="sep">/</span>
//           <span>dashboard</span>
//         </span>
//         ...
//
// AFTER:
//
//   function TitleBar({ running, queued, totalCost, onHamburger }) {
//     const now = useClock();
//     return (
//       <div className="title">
//         {onHamburger && (
//           <button className="hamb" onClick={onHamburger} aria-label="menu">≡</button>
//         )}
//         <span className="dots"><i /><i /><i /></span>
//         <span className="crumb">
//           <b>~/agent-manager</b>
//           <span className="sep">/</span>
//           <span>dashboard</span>
//         </span>
//         ...
//
// (The CSS additions hide `.hamb` at desktop widths and reveal it at <=720px,
// so it only appears when the user can actually use it.)
