// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters, a per-protocol detail view with the model's own inputs and the
// protocol's farm plan, the live-token view, and the methodology. No network: every byte it shows
// is in data.js. The page recomputes each row's implied value from the snapshot figures and checks
// it against board.json's number, so the page's code and the board's data are visibly the same
// arithmetic. Hash routes: #p=<slug> opens a detail view; #q=, #category=, #chain= filter the board.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // The model in one function: TVL x category multiple x growth x maturity x chains.
  // category_multiple comes from the row itself (board.json's model breakdown), so the page checks
  // the board's number instead of re-deriving the market multiples.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = row.chain_multiplier;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return 'Join $' + capital + ' of the next sale on ' + name + ' and hold the allocation.';
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('gaming') >= 0 || c.indexOf('gamble') >= 0) return 'Play with $' + capital + ' on ' + name + ' and keep the account active.';
    if (c.indexOf('social') >= 0) return 'Post and engage daily on ' + name + ' with a wallet-linked account.';
    if (c.indexOf('oracle') >= 0) return 'Run one feed or query the oracle on ' + name + ' and log the result.';
    if (c.indexOf('wallet') >= 0) return 'Move $' + capital + ' through the ' + name + ' wallet on ' + chain + ' and keep it funded.';
    if (c.indexOf('nft') >= 0) return 'Mint or trade one item on ' + name + ' with $' + capital + ' and hold it.';
    if (c.indexOf('ai') >= 0) return 'Run one job or query on ' + name + ' and pay the fee in the chain\'s token.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' }
    ];
    if (p.chains && p.chains.length > 1) {
      steps.push({ text: 'Repeat the same position on ' + p.chains[1] + ' too, so the activity shows on more than one chain.', cost: 'another $' + capital + ' of capital and about $4 of gas', time: '15 minutes' });
    }
    steps.push(
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    );
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function bySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'implied') { va = a.implied_value_usd; vb = b.implied_value_usd; }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -Infinity : a.change_7d; vb = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  function sortHead(label, key, cls) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '';
    return el('th', { 'class': cls || '', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      render();
    } }, label + arrow);
  }

  function renderDetail(row) {
    var checked = impliedOf(row, DATA.model) === row.implied_value_usd;
    var box = el('section', { 'class': 'detail', 'aria-label': 'Protocol detail' });
    box.appendChild(el('h2', {}, row.name));
    var chainList = (row.chains || []).slice(0, 3).join(', ') + ((row.chains || []).length > 3 ? ' +' + ((row.chains || []).length - 3) : '');
    box.appendChild(el('p', { 'class': 'sub' }, '#' + row.rank + ' · ' + (row.category || 'uncategorised') + ' · ' + chainList + ' · records no token (no market cap, no CoinGecko id, no symbol)'));
    var kv = el('div', { 'class': 'kv' });
    kv.appendChild(el('div', {}, el('b', {}, fmtUsd(row.implied_value_usd)), el('span', {}, 'implied value' + (checked ? ' — model check ✓' : ''))));
    kv.appendChild(el('div', {}, el('b', {}, fmtUsd(row.tvl_usd)), el('span', {}, 'TVL')));
    kv.appendChild(el('div', {}, el('b', {}, fmtPct(row.change_7d)), el('span', {}, 'TVL change, 7 days')));
    kv.appendChild(el('div', {}, el('b', {}, fmtAge(row.age_days)), el('span', {}, 'tracked, no token yet')));
    kv.appendChild(el('div', {}, el('b', {}, '×' + row.category_multiple.toFixed(2)), el('span', {}, 'category multiple (mcap/TVL)')));
    kv.appendChild(el('div', {}, el('b', {}, '×' + row.growth_multiplier.toFixed(2) + ' · ×' + row.maturity_multiplier.toFixed(2) + ' · ×' + row.chain_multiplier.toFixed(2)), el('span', {}, 'growth · maturity · chains')));
    box.appendChild(kv);
    box.appendChild(el('p', { 'class': 'note' }, 'Implied value = TVL × category multiple × growth × maturity × chains. The category multiple is the median mcap/TVL of live-token protocols in ' + (row.category || 'this category') + '; the full table is under How the value is scored.'));
    box.appendChild(el('h3', {}, 'How to farm it'));
    var ol = el('ol', { 'class': 'plan' });
    farmSteps(row).forEach(function (s) { ol.appendChild(el('li', {}, s)); });
    box.appendChild(ol);
    box.appendChild(el('p', {}, el('button', { 'class': 'linklike', onclick: function () { state.selected = null; writeHash(); render(); } }, '← Back to the board')));
    return box;
  }

  function renderBoard() {
    var rows = filteredRows();
    var table = el('table', { 'class': 'board' });
    var head = el('tr', {},
      sortHead('#', 'implied', 'num'),
      sortHead('Protocol', 'name'),
      el('th', {}, 'Category'),
      el('th', {}, 'Chains'),
      sortHead('TVL', 'tvl', 'num'),
      sortHead('7d', 'growth', 'num'),
      sortHead('Age', 'age', 'num'),
      sortHead('Implied value', 'implied', 'num'));
    table.appendChild(el('thead', {}, head));
    var body = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', { onclick: function () { state.selected = r.slug; writeHash(); render(); } });
      tr.appendChild(el('td', { 'class': 'num rank' }, String(r.rank)));
      var name = el('td', { 'class': 'name' });
      name.appendChild(el('b', {}, r.name));
      name.appendChild(el('small', {}, r.slug));
      tr.appendChild(name);
      tr.appendChild(el('td', {}, r.category || '—'));
      tr.appendChild(el('td', {}, (r.chains || []).slice(0, 3).join(', ') + (r.chains && r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
      tr.appendChild(el('td', { 'class': 'num' }, fmtUsd(r.tvl_usd)));
      var g = el('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down') }, fmtPct(r.change_7d));
      tr.appendChild(g);
      tr.appendChild(el('td', { 'class': 'num' }, fmtAge(r.age_days)));
      tr.appendChild(el('td', { 'class': 'num' }, fmtUsd(r.implied_value_usd)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return { table: table, count: rows.length };
  }

  function renderLive() {
    var table = el('table', { 'class': 'board' });
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', { 'class': 'num' }, '#'),
      el('th', {}, 'Protocol'),
      el('th', {}, 'Category'),
      el('th', { 'class': 'num' }, 'TVL'),
      el('th', { 'class': 'num' }, 'Market cap'),
      el('th', { 'class': 'num' }, 'mcap / TVL'))));
    var body = el('tbody');
    DATA.live.forEach(function (p, i) {
      var tr = el('tr');
      tr.appendChild(el('td', { 'class': 'num rank' }, String(i + 1)));
      var name = el('td', { 'class': 'name' });
      name.appendChild(el('b', {}, p.name));
      name.appendChild(el('small', {}, p.slug));
      tr.appendChild(name);
      tr.appendChild(el('td', {}, p.category || '—'));
      tr.appendChild(el('td', { 'class': 'num' }, fmtUsd(p.tvl_usd)));
      tr.appendChild(el('td', { 'class': 'num' }, fmtUsd(p.mcap_usd)));
      tr.appendChild(el('td', { 'class': 'num' }, p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : 'n/a'));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function renderMethod() {
    var sec = el('section', { 'class': 'card' });
    sec.appendChild(el('h2', {}, 'How the value is scored'));
    sec.appendChild(el('div', { 'class': 'formula', 'html': 'implied = TVL × <b>category multiple</b> × growth × maturity × chains<br>category multiple = median mcap/TVL of live-token protocols in the same category<br>growth = 1 + clamp(change_7d, −50%, +100%) × 0.5 &nbsp;·&nbsp; maturity = 0.6 + min(age, 1095d)/1095 × 0.4<br>chains = 1 + 0.02 × min(chains − 1, 4) &nbsp;·&nbsp; overall median multiple = ×' + DATA.overall_multiple.toFixed(2) }));
    sec.appendChild(el('p', {}, 'A category whose tokens trade richly against TVL earns its pre-token protocols a higher implied value than one whose tokens trade thinly — the market\u2019s own pricing, read off the snapshot, not the author\u2019s taste. No protocol name is ever special-cased: the same function scores every row. Wrapped, staked and bridged products of tokens that already trade (WBTC, exchange staking products, bridges) are set aside with the live-token view: they are not launches waiting to happen.'));
    var mults = DATA.multiples.filter(function (m) { return m.samples >= 3; });
    var table = el('table', { 'class': 'mult' });
    table.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', { 'class': 'num' }, 'Live protocols'), el('th', { 'class': 'num' }, 'Median mcap / TVL'))));
    var body = el('tbody');
    mults.forEach(function (m) {
      body.appendChild(el('tr', {}, el('td', {}, m.category), el('td', { 'class': 'num' }, String(m.samples)), el('td', { 'class': 'num' }, '×' + m.multiple.toFixed(2))));
    });
    table.appendChild(body);
    sec.appendChild(table);
    sec.appendChild(el('p', { 'class': 'note' }, '“Records no token” means the snapshot carries no market cap, CoinGecko id or symbol for the protocol — never that it has none. A protocol on the list may still have a token its record does not carry. The board is a claim about what a token would be worth if the protocol\u2019s record stayed as it is; it does not predict whether or when a token is issued.'));
    return sec;
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var hero = el('header', { 'class': 'hero' });
    hero.appendChild(el('h1', { 'html': 'Token Radar<span class="dot">.</span>' }));
    hero.appendChild(el('p', {}, 'Every pre-token protocol in the sealed snapshot, ranked by what its token would be worth — and what to do to farm it before it launches.'));
    hero.appendChild(el('p', { 'class': 'meta' }, 'Snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source) + ' · model ' + esc(DATA.model_version)));
    var stats = el('div', { 'class': 'stats' });
    stats.appendChild(el('div', { 'class': 'stat' }, el('b', {}, String(DATA.board_size)), el('span', {}, 'protocols ranked')));
    stats.appendChild(el('div', { 'class': 'stat' }, el('b', {}, String(DATA.watchlist_size)), el('span', {}, 'on the watchlist floor')));
    stats.appendChild(el('div', { 'class': 'stat' }, el('b', {}, String(DATA.early_size)), el('span', {}, 'early finds below the floor')));
    stats.appendChild(el('div', { 'class': 'stat' }, el('b', {}, fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0)), el('span', {}, 'top implied value')));
    stats.appendChild(el('div', { 'class': 'stat' }, el('b', {}, '×' + DATA.overall_multiple.toFixed(2)), el('span', {}, 'overall mcap / TVL')));
    hero.appendChild(stats);
    app.appendChild(hero);

    var wrap = el('div', { 'class': 'wrap' });
    var tabs = el('div', { 'class': 'tabs' });
    tabs.appendChild(el('button', { 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', onclick: function () { state.tab = 'pre-token'; state.selected = null; writeHash(); render(); } }, 'Pre-token board (' + DATA.board_size + ')'));
    tabs.appendChild(el('button', { 'aria-pressed': state.tab === 'live' ? 'true' : 'false', onclick: function () { state.tab = 'live'; state.selected = null; writeHash(); render(); } }, 'Already trading (' + DATA.live_size + ')'));
    wrap.appendChild(tabs);

    if (state.tab === 'live') {
      wrap.appendChild(el('p', { 'class': 'note' }, 'These protocols already have a token that trades, so the board shows the market\u2019s own value — market cap and mcap/TVL — never a model\u2019s guess. They are the comparables the pre-token multiples are read from.'));
      wrap.appendChild(renderLive());
      wrap.appendChild(renderMethod());
    } else {
      if (state.selected) {
        var row = bySlug(state.selected);
        if (row) wrap.appendChild(renderDetail(row));
      }
      var controls = el('div', { 'class': 'controls' });
      var qBox = el('div', {});
      qBox.appendChild(el('label', {}, 'Search'));
      var qInput = el('input', { type: 'search', placeholder: 'name or slug…', value: state.q, onchange: function (e) { state.q = e.target.value; writeHash(); render(); } });
      qBox.appendChild(qInput);
      controls.appendChild(qBox);
      var catBox = el('div', {});
      catBox.appendChild(el('label', {}, 'Category'));
      var catSel = el('select', { onchange: function (e) { state.category = e.target.value; writeHash(); render(); } });
      catSel.appendChild(el('option', { value: 'all' }, 'All categories'));
      var cats = [];
      DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
      cats.sort().forEach(function (c) { var o = el('option', { value: c }, c); if (state.category === c) o.selected = true; catSel.appendChild(o); });
      catBox.appendChild(catSel);
      controls.appendChild(catBox);
      var chainBox = el('div', {});
      chainBox.appendChild(el('label', {}, 'Chain'));
      var chainSel = el('select', { onchange: function (e) { state.chain = e.target.value; writeHash(); render(); } });
      chainSel.appendChild(el('option', { value: 'all' }, 'All chains'));
      var chains = [];
      DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
      chains.sort().forEach(function (c) { var o = el('option', { value: c }, c); if (state.chain === c) o.selected = true; chainSel.appendChild(o); });
      chainBox.appendChild(chainSel);
      controls.appendChild(chainBox);
      wrap.appendChild(controls);
      var b = renderBoard();
      wrap.appendChild(b.table);
      wrap.appendChild(el('p', { 'class': 'count' }, 'Showing ' + b.count + ' of ' + DATA.board_size + ' ranked protocols. Click a row for its detail view and farm plan.'));
      wrap.appendChild(renderMethod());
    }
    wrap.appendChild(el('footer', {}, 'Token Radar · model ' + esc(DATA.model_version) + ' · snapshot ' + esc(DATA.as_of) + ' · built from the sealed DefiLlama snapshot; no network, no live prices.'));
    app.appendChild(wrap);
  }

  readHash();
  render();
})();
