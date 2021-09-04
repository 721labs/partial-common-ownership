import { expect } from "chai";

// Utils
import deploy from "../utils/deploy";

describe("Deploys", () => {
  it("Should deploy to local hardhat network", async () => {
    const contract = await deploy("HelloWorld", []);
    expect(contract.address).to.not.be.null;
  });
});
