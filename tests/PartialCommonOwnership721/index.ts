import yaml from "js-yaml";
import fs from "fs";
import tests from "./tests";
import type { TestConfiguration } from "./types";

//$ Load Test Configurations

const CONFIGS_DIR = "tests/PartialCommonOwnership721/configs";

const configFileNames = fs.readdirSync(CONFIGS_DIR);
const configurations = configFileNames.map((filename) => {
  return yaml.load(
    fs.readFileSync(`${CONFIGS_DIR}/${filename}`, "utf8")
  ) as TestConfiguration;
});

//$ Run

describe("PartialCommonOwnership721", async () => {
  for await (const config of configurations) {
    describe(config.name, async () => {
      await tests(config);
    });
  }
});
