import tests from "./tests";

// Test under different taxation parameters.
const configs = [
  { name: "5% Quarterly", collectionFrequency: 90, taxRate: 50000000000 },
  { name: "100% Monthly", collectionFrequency: 30, taxRate: 1000000000000 },
  { name: "100% Annually", collectionFrequency: 365, taxRate: 1000000000000 },
];

//$ Run

describe("Wrapper", async () => {
  for await (const config of configs) {
    describe(config.name, async () => {
      await tests(config);
    });
  }
});
