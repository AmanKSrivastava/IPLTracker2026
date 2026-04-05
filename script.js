const statusEl = document.getElementById("status");
const leaderboardEl = document.getElementById("leaderboard");
const settlementEl = document.getElementById("settlement");
const matchesEl = document.getElementById("matches");
const paginationEl = document.getElementById("pagination");
const totalMatchesEl = document.getElementById("totalMatches");
const totalPlayersEl = document.getElementById("totalPlayers");
const topLeaderEl = document.getElementById("topLeader");
const topLeaderAmountEl = document.getElementById("topLeaderAmount");
const entryFeeDisplayEl = document.getElementById("entryFeeDisplay");
const playerTotalsEl = document.getElementById("playerTotals");
const winsTableEl = document.getElementById("winsTable");
const completedOnlyToggleEl = document.getElementById("completedOnlyToggle");

let dashboardData = null;
let allMatches = [];
let currentPage = 1;
let showCompletedOnly = completedOnlyToggleEl?.checked ?? true;
const matchesPerPage = 4;

completedOnlyToggleEl?.addEventListener("change", () => {
  showCompletedOnly = completedOnlyToggleEl.checked;
  currentPage = 1;
  updateDashboard();
});

initDashboard();

async function initDashboard() {
  try {
    statusEl.textContent = "Loading data from data.json...";

    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rawData = await response.json();
    dashboardData = normalizeData(rawData);
    showCompletedOnly = completedOnlyToggleEl?.checked ?? true;
    updateDashboard();
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    statusEl.innerHTML =
      '<span class="error">Could not load `data.json`. Open the project with a local server like Live Server.</span>';
    leaderboardEl.innerHTML = '<div class="empty-state">No data to show.</div>';
    settlementEl.innerHTML =
      '<div class="empty-state">No settlements to show.</div>';
    playerTotalsEl.innerHTML =
      '<div class="empty-state">No player totals to show.</div>';
    matchesEl.innerHTML = '<div class="empty-state">No matches to show.</div>';
    paginationEl.innerHTML = "";
    totalMatchesEl.textContent = "0";
    totalPlayersEl.textContent = "0";
    topLeaderEl.textContent = "-";
    topLeaderAmountEl.textContent = "₹0";
    entryFeeDisplayEl.textContent = "₹0";
  }
}

function updateDashboard() {
  if (!dashboardData) {
    return;
  }

  const result = processMatches(dashboardData, {
    completedOnly: showCompletedOnly,
  });

  allMatches = [...result.matches].sort((a, b) => {
    if (a.completed && !b.completed) return -1;
    if (!a.completed && b.completed) return 1;
    // both same status
    if (a.completed) {
      // both completed, sort by date descending (most recent first)
      return sortByDate(b.date, a.date);
    } else {
      // both upcoming, sort by date ascending
      return sortByDate(a.date, b.date);
    }
  });

  renderSummary(dashboardData, result);
  renderLeaderboard(result.balances, result.countedMatches.length > 0);
  renderPlayerTotals(
    calculatePlayerTotals(dashboardData.players, result.countedMatches),
  );
  renderWinsTable(result.matches);
  renderSettlement(result.balances, result.countedMatches.length > 0);
  renderMatches();

  const modeText = showCompletedOnly
    ? "completed matches only"
    : "all scheduled matches";

  statusEl.textContent = `Loaded ${result.totalScheduled} scheduled matches • ${result.completedCount} completed • scoring uses ${modeText}.`;
}

function normalizeData(rawData) {
  if (Array.isArray(rawData)) {
    const playerSet = new Set();

    rawData.forEach((match) => {
      Object.keys(match.scores || match.players || {}).forEach((player) => {
        playerSet.add(player);
      });
    });

    return {
      entryFee: Number(rawData.entryFee ?? rawData.entry_fee ?? 50),
      players: Array.from(playerSet),
      matches: rawData.map((match, index) => {
        const scores = match.scores || match.players || {};

        return {
          matchNo: Number(match.matchNo ?? match.match_no ?? index + 1),
          match:
            match.match ||
            match.match_between ||
            `Match ${match.matchNo ?? match.match_no ?? index + 1}`,
          date: match.date || "",
          time: match.time || "7:30 PM IST",
          venue: match.venue || "Venue to be updated",
          completed:
            typeof match.completed === "boolean"
              ? match.completed
              : hasScoreData(scores),
          entryFee: Number(match.entryFee ?? match.entry_fee ?? 50),
          scores,
        };
      }),
    };
  }

  if (rawData && Array.isArray(rawData.matches)) {
    return {
      entryFee: Number(rawData.entryFee ?? rawData.entry_fee ?? 50),
      players:
        rawData.players ||
        Array.from(
          new Set(
            rawData.matches.flatMap((match) =>
              Object.keys(match.scores || match.players || {}),
            ),
          ),
        ),
      matches: rawData.matches.map((match, index) => {
        const scores = match.scores || match.players || {};

        return {
          matchNo: Number(match.matchNo ?? match.match_no ?? index + 1),
          match:
            match.match ||
            match.match_between ||
            `Match ${match.matchNo ?? match.match_no ?? index + 1}`,
          date: match.date || "",
          time: match.time || "7:30 PM IST",
          venue: match.venue || "Venue to be updated",
          completed:
            typeof match.completed === "boolean"
              ? match.completed
              : hasScoreData(scores),
          entryFee: Number(
            match.entryFee ??
              match.entry_fee ??
              rawData.entryFee ??
              rawData.entry_fee ??
              50,
          ),
          scores,
        };
      }),
    };
  }

  throw new Error("Unsupported JSON format in data.json");
}

function hasScoreData(scores = {}) {
  return Object.values(scores).some((score) => Number(score) > 0);
}

function processMatches(data, { completedOnly = true } = {}) {
  const balances = Object.fromEntries(
    data.players.map((player) => [player, 0]),
  );

  let completedCount = 0;

  const processedMatches = data.matches.map((match, index) => {
    const scores = match.scores || {};
    const activePlayers = Object.entries(scores).filter(
      ([, score]) => Number(score) > 0,
    );
    const entryFee = Number(match.entryFee ?? data.entryFee ?? 50);
    const completed = Boolean(match.completed);

    if (completed) {
      completedCount += 1;
    }

    let winner = completed ? "Pending" : "Upcoming";
    let winningScore = 0;
    let totalPool = 0;

    if (activePlayers.length > 0) {
      const topScore = activePlayers.reduce((best, current) =>
        Number(current[1]) > Number(best[1]) ? current : best,
      );

      winner = topScore[0];
      winningScore = Number(topScore[1]);
      totalPool = entryFee * activePlayers.length;
    }

    const counted = activePlayers.length > 0 && (!completedOnly || completed);

    if (counted) {
      activePlayers.forEach(([player]) => {
        if (player === winner) {
          balances[player] += totalPool - entryFee;
        } else {
          balances[player] -= entryFee;
        }
      });
    }

    return {
      ...match,
      id: match.matchNo ?? index + 1,
      matchNo: match.matchNo ?? index + 1,
      completed,
      counted,
      entryFee,
      totalPool,
      winner,
      winningScore,
      activePlayers: activePlayers.map(([player]) => player),
    };
  });

  return {
    balances,
    matches: processedMatches,
    countedMatches: processedMatches.filter((match) => match.counted),
    completedCount,
    totalScheduled: processedMatches.length,
  };
}

function renderSummary(data, result) {
  const sorted = Object.entries(result.balances).sort((a, b) => b[1] - a[1]);
  const hasCountedMatches = result.countedMatches.length > 0;
  const [leaderName, leaderAmount] = sorted[0] || ["-", 0];

  totalMatchesEl.textContent = `${result.countedMatches.length}/${result.totalScheduled}`;
  totalPlayersEl.textContent = String(data.players.length);
  topLeaderEl.textContent = hasCountedMatches ? leaderName : "Pending";
  topLeaderAmountEl.textContent = hasCountedMatches
    ? formatCurrency(leaderAmount)
    : "No scored match";
  entryFeeDisplayEl.textContent = formatCurrency(data.entryFee ?? 0);
}

function renderLeaderboard(balances, hasCountedMatches) {
  const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  const rows = sorted
    .map(
      ([name, balance], index) => `
        <div class="leader-row">
          <div class="leader-user">
            <span class="rank-badge">${index + 1}</span>
            <div>
              <span class="leader-name">${name}</span>
              <span class="leader-note">${balance === 0 ? "Neutral" : balance > 0 ? "In profit" : "Needs recovery"}</span>
            </div>
          </div>
          <span class="amount ${balance >= 0 ? "positive" : "negative"}">${formatCurrency(balance)}</span>
        </div>
      `,
    )
    .join("");

  leaderboardEl.innerHTML =
    (hasCountedMatches
      ? ""
      : '<div class="empty-state">Completed scores will appear here as matches finish.</div>') +
    rows;
}

function calculatePlayerTotals(players, matches) {
  const totals = Object.fromEntries(
    players.map((player) => [
      player,
      { total: 0, played: 0, best: 0, wins: 0 },
    ]),
  );

  matches.forEach((match) => {
    Object.entries(match.scores || {}).forEach(([player, score]) => {
      const numericScore = Number(score || 0);

      if (!totals[player]) {
        totals[player] = { total: 0, played: 0, best: 0, wins: 0 };
      }

      totals[player].total += numericScore;
      if (numericScore > 0) {
        totals[player].played += 1;
      }
      totals[player].best = Math.max(totals[player].best, numericScore);
      if (player === match.winner) {
        totals[player].wins += 1;
      }
    });
  });

  return Object.entries(totals)
    .map(([name, stats]) => ({
      name,
      total: stats.total,
      played: stats.played,
      best: stats.best,
      wins: stats.wins,
      average: stats.played ? stats.total / stats.played : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function renderPlayerTotals(players) {
  playerTotalsEl.innerHTML = `
    <table class="points-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Total Points</th>
          <th>Matches Played</th>
          <th>Avg/Match</th>
          <th>Best Score</th>
          <th>Wins</th>
        </tr>
      </thead>
      <tbody>
        ${players
          .map(
            (player, index) => `
              <tr>
                <td class="table-rank">#${index + 1}</td>
                <td>${player.name}</td>
                <td>${formatPoints(player.total)}</td>
                <td>${player.played}</td>
                <td>${formatPoints(player.average)}</td>
                <td>${formatPoints(player.best)}</td>
                <td>${player.wins}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderWinsTable(matches) {
  const wins = [];

  matches.forEach((match) => {
    if (match.completed && match.winner && match.winner !== "Pending") {
      const winningAmount = match.totalPool - match.entryFee;
      wins.push({
        matchNo: match.matchNo,
        match: match.match,
        date: match.date,
        winner: match.winner,
        winningAmount: winningAmount,
        winningScore: match.winningScore,
      });
    }
  });

  if (wins.length === 0) {
    winsTableEl.innerHTML =
      '<div class="empty-state">No wins recorded yet.</div>';
    return;
  }

  winsTableEl.innerHTML = `
    <table class="points-table">
      <thead>
        <tr>
          <th>Match #</th>
          <th>Match</th>
          <th>Date</th>
          <th>Winner</th>
          <th>Winning Score</th>
          <th>Prize Amount</th>
        </tr>
      </thead>
      <tbody>
        ${wins
          .map(
            (win) => `
              <tr>
                <td class="table-rank">#${win.matchNo}</td>
                <td>${win.match}</td>
                <td>${formatDate(win.date)}</td>
                <td><strong>${win.winner}</strong></td>
                <td>${formatPoints(win.winningScore)}</td>
                <td class="positive">${formatCurrency(win.winningAmount)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function calculateSettlement(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([name, balance]) => {
    if (balance < 0) debtors.push({ name, amount: -balance });
    if (balance > 0) creditors.push({ name, amount: balance });
  });

  const transactions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return transactions;
}

function renderSettlement(balances, hasCountedMatches) {
  if (!hasCountedMatches) {
    settlementEl.innerHTML =
      '<div class="settlement">Waiting for completed match scores.</div>';
    return;
  }

  const transactions = calculateSettlement(balances);

  settlementEl.innerHTML =
    transactions.length === 0
      ? '<div class="settlement">All settled 🎉</div>'
      : transactions
          .map(
            (transaction) => `
              <div class="settlement">
                <span class="pay">${transaction.from}</span>
                pays ${formatCurrency(transaction.amount)} to
                <span class="receive">${transaction.to}</span>
              </div>
            `,
          )
          .join("");
}

function renderMatches() {
  if (!allMatches.length) {
    matchesEl.innerHTML = '<div class="empty-state">No matches to show.</div>';
    paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(allMatches.length / matchesPerPage));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * matchesPerPage;
  const visibleMatches = allMatches.slice(start, start + matchesPerPage);

  matchesEl.innerHTML = visibleMatches
    .map(
      (match) => `
        <article class="match-card ${match.completed ? "is-completed" : "is-upcoming"}">
          <div class="match-topline">
            <div class="match-date">${formatDate(match.date)}</div>
            <span class="chip status-chip ${match.completed ? "is-completed" : "is-upcoming"}">${match.completed ? "Completed" : "Upcoming"}</span>
          </div>
          <h3>#${match.matchNo} • ${match.match}</h3>
          <div class="match-chip-row">
            <span class="chip">${match.time || "7:30 PM IST"}</span>
            <span class="chip">${match.venue || "Venue to be updated"}</span>
            <span class="chip">${match.counted ? "Points counted" : "Not counted yet"}</span>
          </div>
          <div class="match-stats">
            <div class="stat-box">
              <span>Winner</span>
              <strong>${match.winner || "-"}</strong>
            </div>
            <div class="stat-box">
              <span>Winning Score</span>
              <strong>${formatPoints(match.winningScore || 0)}</strong>
            </div>
            <div class="stat-box">
              <span>Active Players</span>
              <strong>${match.activePlayers.length}</strong>
            </div>
          </div>
          <div class="points-breakdown">
            ${renderPointsBreakdown(match.scores, match.winner)}
          </div>
        </article>
      `,
    )
    .join("");

  renderPagination(totalPages);
}

function renderPointsBreakdown(scores, winner) {
  const entries = Object.entries(scores || {}).filter(
    ([, score]) => Number(score) > 0,
  );

  if (!entries.length) {
    return '<div class="empty-state">Scores will update after the match is completed.</div>';
  }

  return entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(
      ([player, score]) => `
        <div class="point-pill ${player === winner ? "is-winner" : ""}">
          <span>${player}</span>
          <strong>${formatPoints(score)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    paginationEl.innerHTML = '<span class="page-indicator">1 page</span>';
    return;
  }

  paginationEl.innerHTML = `
    <button class="page-btn" id="prevPage" ${currentPage === 1 ? "disabled" : ""}>← Prev</button>
    <span class="page-indicator">Page ${currentPage} / ${totalPages}</span>
    <button class="page-btn" id="nextPage" ${currentPage === totalPages ? "disabled" : ""}>Next →</button>
  `;

  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderMatches();
    }
  });

  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      renderMatches();
    }
  });
}

function formatDate(dateString) {
  if (!dateString) {
    return "Date to be updated";
  }

  const parsedDate = new Date(dateString);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }

  return parsedDate.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sortByDate(firstDate, secondDate) {
  const first = Date.parse(firstDate || "") || Number.MAX_SAFE_INTEGER;
  const second = Date.parse(secondDate || "") || Number.MAX_SAFE_INTEGER;
  return first - second;
}

function formatPoints(points) {
  const value = Number(points || 0);
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatCurrency(amount) {
  const value = Number(amount || 0);
  const fixed = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  return `₹${fixed}`;
}
