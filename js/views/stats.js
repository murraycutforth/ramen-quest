import { data } from '../store.js';
import { stats, fmtScore } from '../scoring.js';
import { PEOPLE } from '../config.js';
import { html, bowls, personScores, fmtDate, icon } from '../ui.js';

let el;
export function initStats(container) { el = container; }

const link = (r) => html`<a href="#stats/r/${r.id}">${r.name}</a>`;

function funCard(emoji, title, body) {
  return html`<li class="fun"><span class="fun-emoji" aria-hidden="true">${emoji}</span><h3>${title}</h3><div>${body}</div></li>`;
}

function rankTable(rows, caption) {
  return html`
    <table class="rank">
      <caption>${caption}</caption>
      <thead><tr><th scope="col">#</th><th scope="col">Restaurant</th><th scope="col">Score</th><th scope="col"><span class="sr-only">Each of us</span></th></tr></thead>
      <tbody>
        ${rows.map((x, i) => html`
          <tr class="${i === 0 ? 'top' : ''}">
            <td>${i === 0 ? '👑' : i + 1}</td>
            <th scope="row">${link(x.restaurant)}</th>
            <td><b>${fmtScore(x.combined)}</b></td>
            <td>${personScores(x.people)}</td>
          </tr>`)}
      </tbody>
    </table>`;
}

export function renderStats() {
  if (!el) return;
  const { restaurants, visits } = data();
  const st = stats(restaurants, visits);
  const p = st.progress;
  const champ = st.ranking[0];

  if (!visits.length) {
    el.innerHTML = html`
      <div class="stats">
        <div class="empty-hero">
          <svg class="ico ico-hero" aria-hidden="true"><use href="#i-bowl-outline"/></svg>
          <h2>No stats yet</h2>
          <p>Slurp your first bowl and the numbers will start showing up here.</p>
          <a class="btn btn-primary" href="#list">Find somewhere to go</a>
        </div>
      </div>`.s;
    return;
  }

  el.innerHTML = html`
    <div class="stats">
      ${p.complete
        ? html`<section class="complete" aria-live="polite">
            <h2>🎉 Quest complete! 🎉</h2>
            <p>All ${p.mainTotal} bowls slurped.</p>
            ${champ ? html`<div class="champion"><span class="crown" aria-hidden="true">👑</span>
              <svg class="ico ico-hero" aria-hidden="true"><use href="#i-bowl"/></svg>
              <p>Champion bowl: <b>${link(champ.restaurant)}</b> (${fmtScore(champ.combined)})</p></div>` : ''}
          </section>`
        : ''}

      <ul class="tiles">
        <li><b>${p.mainVisited}/${p.mainTotal}</b><span>main quest</span></li>
        <li><b>${st.totalBowls}</b><span>bowls eaten</span></li>
        <li><b>${st.totalVisits}</b><span>visits</span></li>
        <li><b>${st.questStarted ? fmtDate(st.questStarted) : '–'}</b><span>quest started</span></li>
      </ul>

      ${st.ranking.length
        ? rankTable(st.ranking, 'Ranking')
        : html`<p class="empty-small">No main-quest scores yet.</p>`}

      <ul class="funs">
        ${st.bestBroth ? funCard('🥣', 'Best broth', html`${link(st.bestBroth.restaurant)} ${bowls(st.bestBroth.value)}`) : ''}
        ${st.bestNoodles ? funCard('🍜', 'Best noodles', html`${link(st.bestNoodles.restaurant)} ${bowls(st.bestNoodles.value)}`) : ''}
        ${st.biggestDisagreement && st.biggestDisagreement.gap > 0
          ? funCard('⚡', 'Biggest disagreement', html`${link(st.biggestDisagreement.restaurant)} ${personScores(st.biggestDisagreement.people)} <small>${fmtScore(st.biggestDisagreement.gap)} apart</small>`)
          : ''}
        ${st.mostAgreed
          ? funCard('🤝', 'Most agreed-upon', html`${link(st.mostAgreed.restaurant)} ${personScores(st.mostAgreed.people)}${st.mostAgreed.gap === 0 ? html` <small>perfect match</small>` : ''}`)
          : ''}
        ${PEOPLE.map((who) => {
          const fav = st.favourites[who.id];
          return fav ? funCard(who.id === 'murray' ? '💛' : '💗', `${who.name}’s favourite`, html`${link(fav.restaurant)} <b>${fmtScore(fav.score)}</b>`) : '';
        })}
      </ul>

      ${st.sideRanking.length ? rankTable(st.sideRanking, 'Side quests') : ''}
      <p class="stats-foot">${icon('bowl')} ${p.sideVisited} of ${p.sideTotal} side quests done</p>
    </div>`.s;
}
