// Edits for app.jsx to wire up the mobile drawer.

// ─── EDIT 1 ────────────────────────────────────────────────────────────────
// Add drawer state next to the other overlay state.
//
// BEFORE:
//   const [openWorkspace, setOpenWorkspace] = React.useState(null); // 'memory' | 'schedules' | 'stats'
//
// AFTER:
//   const [openWorkspace, setOpenWorkspace] = React.useState(null); // 'memory' | 'schedules' | 'stats'
//   const [drawerOpen, setDrawerOpen] = React.useState(false);


// ─── EDIT 2 ────────────────────────────────────────────────────────────────
// Render the drawer state on the root + add the backdrop + pass the toggle to
// the TitleBar.
//
// BEFORE:
//   <div className="app" data-layout={t.layout} data-log={t.showLog ? "on" : "off"}>
//     {t.layout === "top"
//       ? <TopNav tab={tab} setTab={setTab} counts={counts} />
//       : <TitleBar running={counts.running} queued={totals.queued} totalCost={totals.cost} />}
//
// AFTER:
//   <div className="app" data-layout={t.layout} data-log={t.showLog ? "on" : "off"}
//     data-mobile-drawer={drawerOpen ? "1" : "0"}>
//     {t.layout === "top"
//       ? <TopNav tab={tab} setTab={setTab} counts={counts} />
//       : <TitleBar running={counts.running} queued={totals.queued} totalCost={totals.cost}
//           onHamburger={() => setDrawerOpen((d) => !d)} />}
//
//     {drawerOpen && (
//       <div className="mobile-backdrop" onClick={() => setDrawerOpen(false)} />
//     )}


// ─── EDIT 3 ────────────────────────────────────────────────────────────────
// Close the drawer when the user makes a selection inside it (so they aren't
// stuck looking at the drawer after picking something).
//
// In the <LeftRail … /> invocation, find:
//
//   onOpenWorkspace={(tab) => setOpenWorkspace(tab)}
//
// Replace with:
//
//   onOpenWorkspace={(tab) => { setOpenWorkspace(tab); setDrawerOpen(false); }}
//
// And inside the onOpenAgent callback, after `setOpenChat(sess.id);`, add:
//
//   setDrawerOpen(false);
