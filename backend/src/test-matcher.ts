import { normalizeName, getTokens, matchTokens } from './matcher';

const mockDb = [
  "Marcelo Mesquita dos Santos",
  "Marcelo Messias dos Santos",
  "Marcelo Moreira Silva",
  "Maria Mesquita dos Santos",
  "Marcello Mesquita dos Santos"
];

function runTest(query: string) {
  console.log(`\n--- Search Query: "${query}" ---`);
  const qNorm = normalizeName(query);
  const qTokens = getTokens(qNorm);

  const results = mockDb.map(target => {
    const tNorm = normalizeName(target);
    const tTokens = getTokens(tNorm);
    const result = matchTokens(qTokens, tTokens);
    return {
      target,
      ...result
    };
  })
  .filter(r => r.isMatch)
  .sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    console.log("No matches found.");
    return;
  }

  console.log(`Found ${results.length} matches:`);
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.target} (Score: ${r.score})`);
    console.log("   Explanation:", JSON.stringify(r.explanation));
  });
}

// Run test cases
runTest("Marcelo M dos Santos");
runTest("Marcelo Mesquita");
runTest("Marcelo Santos");
runTest("Marcello M dos Santos"); // fuzzy first name
runTest("M M dos Santos"); // ultra-abbreviated
