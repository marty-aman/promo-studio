// The weekly plan on Home ("This week"): what to post, who to contact, shows and deadlines, and one thing to do
// first. It reads ONLY the pure model outputs (agenda, overdueTasks, nextUp, the posts and compare), so items
// other features add through registerAgendaSource show up here without this file knowing them. Pure, unit tested.
import { agenda, overdueTasks, nextUp, addDays, parseDate, isoDate, niceDate } from './model.js';
import { compare } from './content.js';
import { docHTML, esc } from './pdf.js';

/** The Monday of the week holding `day` ('YYYY-MM-DD'). */
export function weekStartOf(day) {
  const d = parseDate(day);
  if (!d) return '';
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

// a task that means getting in touch with someone (follow-ups, pitches, outreach, thanks…)
const CONTACT = /\b(follow up|follow-up|pitch|pitches|outreach|curators?|blogs?|radio|e-?mail|call|contact|thank|reach out|send|chase)\b/i;
export const isContact = (it) => (it.kind === 'task' || !it.kind) && CONTACT.test(`${it.title || ''} ${it.sub || ''}`);
const DATED = ['show', 'release', 'shoot', 'event'];

/** The best type of post so far, with how many posts it rests on; null with fewer than two types to compare. */
export function bestType(posts) {
  const g = compare(posts || [], 'format');
  return g.length >= 2 ? { key: g[0].key, n: g[0].n, small: g[0].n < 3 } : null;
}

/**
 * The plan for the 7 days from `weekStart`: { from, to (last day), posts, contacts, dated, tasks, late, best, next,
 * first }. `late` (overdueTasks) is only filled for the week holding today; `next` is nextUp(m, today).
 */
export function weekPlan(m, weekStart, today) {
  const items = agenda(m, weekStart, 7);
  const isNow = today >= weekStart && today < addDays(weekStart, 7);
  const plan = {
    from: weekStart,
    to: addDays(weekStart, 6),
    posts: items.filter((it) => it.kind === 'post'),
    contacts: items.filter(isContact),
    dated: items.filter((it) => DATED.includes(it.kind)),
    tasks: items.filter((it) => !DATED.includes(it.kind) && it.kind !== 'post' && !isContact(it)),
    late: isNow ? overdueTasks(m, today) : [],
    best: bestType(m.posts),
    next: nextUp(m, today),
  };
  plan.first = doFirst(plan, today);
  return plan;
}

export const lateWhat = (x) => (x.source ? x.source.sub || '' : x.song ? `“${x.song.title}”` : x.show ? `Show: ${x.show.venue || 'venue TBD'}` : '');

/** One line: the single most useful thing to do first this week. { text, item?, late? } */
export function doFirst(plan, today) {
  const late = plan.late[0];
  if (late) return { text: `Catch up: ${late.task.text}${lateWhat(late) ? ` (${lateWhat(late)})` : ''}, due ${niceDate(late.due, { weekday: false })}.`, late };
  const soonShow = plan.dated.find((it) => it.kind === 'show' && it.date >= today);
  const prep = soonShow && [...plan.contacts, ...plan.tasks].find((it) => it.date <= soonShow.date && it.date >= today && it.artistId === soonShow.artistId);
  if (prep) return { text: `${prep.title}, before the show at ${soonShow.title} on ${niceDate(soonShow.date)}.`, item: prep };
  const pick = [...plan.contacts, ...plan.tasks].filter((it) => it.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || plan.contacts[0] || plan.tasks[0];
  if (pick) return { text: `${pick.title} (${niceDate(pick.date)}).`, item: pick };
  const post = plan.posts.find((it) => it.date >= today) || plan.posts[0];
  if (post) return { text: `Get “${post.title}” ready to post on ${niceDate(post.date)}.`, item: post };
  const { release, show } = plan.next || {};
  if (release) return { text: `Nothing due this week. Next up: “${release.title}” comes out ${niceDate(release.releaseDate)}; check its rollout.`, item: { ref: { page: 'songs', id: release.id, tab: 'release' } } };
  if (show) return { text: `Nothing due this week. Next up: the show at ${show.venue || 'a venue TBD'} on ${niceDate(show.date)}.`, item: { ref: { page: 'shows', id: show.id } } };
  return { text: 'Nothing planned this week. Set a release date, add a show or plan some posts and they show up here.' };
}

/**
 * Several artists' plans in one (All artists): [{ artistId, artist, plan }] → the same shape, every item tagged
 * with its artist, `best` as a list per artist, and one "do this first" across them.
 */
export function mergePlans(list, today) {
  const tag = (key) => list.flatMap(({ artistId, artist, plan }) => plan[key].map((it) => ({ ...it, artistId, artist })));
  const byDate = (a, b) => (a.date || a.due || '').localeCompare(b.date || b.due || '');
  const first = list[0] ? list[0].plan : null;
  const plan = {
    from: first ? first.from : '',
    to: first ? first.to : '',
    posts: tag('posts').sort(byDate),
    contacts: tag('contacts').sort(byDate),
    dated: tag('dated').sort(byDate),
    tasks: tag('tasks').sort(byDate),
    late: tag('late').sort(byDate),
    best: list.map(({ artistId, artist, plan: p }) => ({ artistId, artist, best: p.best })),
    next: list.map(({ plan: p }) => p.next).find((n) => n && (n.release || n.show)) || { release: null, show: null },
  };
  plan.first = doFirst(plan, today);
  if (plan.first.item && plan.first.item.artist) plan.first.text = `${plan.first.item.artist}: ${plan.first.text}`;
  else if (plan.first.late && plan.first.late.artist) plan.first.text = `${plan.first.late.artist}: ${plan.first.text}`;
  return plan;
}

const KIND = { show: 'Show', release: 'Release', shoot: 'Shoot', post: 'Post', task: 'To do', event: 'Event' };

/**
 * The plan as a printable page. Built from an allow-list of fields (dates, kinds, titles, subtitles, artist
 * names, the late task's song title or show venue): never the fan, contact or member lists.
 */
export function weekHTML(plan, { title = 'This week' } = {}) {
  const who = (it) => (it.artist ? ` <span class="muted">(${esc(it.artist)})</span>` : '');
  const row = (it) => `<tr><td style="width:120px">${esc(niceDate(it.date))}</td><td>${esc(KIND[it.kind] || KIND.task)}</td><td>${esc(it.title || '')}${it.sub ? ` <span class="muted">· ${esc(it.sub)}</span>` : ''}${who(it)}</td></tr>`;
  const table = (list, empty) => (list.length ? `<table>${list.map(row).join('')}</table>` : `<p class="muted">${esc(empty)}</p>`);
  const late = plan.late.map((x) => `<li>${esc(x.task.text)}${lateWhat(x) ? ` <span class="muted">· ${esc(lateWhat(x))}</span>` : ''} · due ${esc(niceDate(x.due, { weekday: false }))}${who(x)}</li>`).join('');
  const bests = Array.isArray(plan.best) ? plan.best.filter((b) => b.best).map((b) => `${esc(b.artist)}: ${esc(b.best.key)} (${b.best.n} posts)`) : plan.best ? [`${esc(plan.best.key)} (${plan.best.n} post${plan.best.n === 1 ? '' : 's'})`] : [];
  const body = `<div class="box"><b>Do this first:</b> ${esc(plan.first.text)}</div>
${late ? `<h2>Late · ${plan.late.length}</h2><ul>${late}</ul>` : ''}
<h2>What to post · ${plan.posts.length}</h2>${table(plan.posts, 'No posts planned this week.')}
${bests.length ? `<p class="small">Best type of post so far: ${bests.join(' · ')}</p>` : ''}
<h2>Who to contact · ${plan.contacts.length}</h2>${table(plan.contacts, 'Nobody to contact this week.')}
<h2>Shows and deadlines · ${plan.dated.length + plan.tasks.length}</h2>${table([...plan.dated, ...plan.tasks].sort((a, b) => a.date.localeCompare(b.date)), 'No shows or deadlines this week.')}`;
  return docHTML(title, body, { subtitle: `${niceDate(plan.from)} to ${niceDate(plan.to)}` });
}
