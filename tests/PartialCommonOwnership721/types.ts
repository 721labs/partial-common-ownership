enum ErrorMessages {
  ONLY_OWNER = "Sender does not own this token",
  BUY_ZERO_PRICE = "New valuation cannot be zero",
  BUY_INCORRECT_CURRENT_PRICE = "Current valuation is incorrect",
  BUY_PRICE_BELOW_CURRENT = "New valuation must be >= current valuation",
  BUY_LACKS_SURPLUS_VALUE = "Message does not contain surplus value for deposit",
  BUY_ALREADY_OWNED = "Buyer is already owner",
  NONEXISTENT_TOKEN = "ERC721: owner query for nonexistent token",
  NEW_PRICE_ZERO = "New price cannot be zero",
  NEW_PRICE_SAME = "New price cannot be same",
  // Not testing reentrancy lock, currently.
  //LOCKED = "Token is locked",
  CANNOT_WITHDRAW_MORE_THAN_DEPOSITED = "Cannot withdraw more than deposited",
  NO_OUTSTANDING_REMITTANCE = "No outstanding remittance",
  PROHIBITED_TRANSFER_METHOD = "Transfers may only occur via purchase/foreclosure",
  BENEFICIARY_ONLY = "Current beneficiary only",
}

enum TOKENS {
  ONE = 1,
  TWO = 2,
  THREE = 3,
}

enum Events {
  APPROVAL = "Approval",
  TRANSFER = "Transfer",
  BUY = "LogBuy",
  OUTSTANDING_REMITTANCE = "LogOutstandingRemittance",
  PRICE_CHANGE = "LogPriceChange",
  FORECLOSURE = "LogForeclosure",
  COLLECTION = "LogCollection",
  REMITTANCE = "LogRemittance",
}

enum RemittanceTriggers {
  LeaseTakeover,
  WithdrawnDeposit,
  OutstandingRemittance,
  TaxCollection,
}

export { ErrorMessages, TOKENS, Events, RemittanceTriggers };
