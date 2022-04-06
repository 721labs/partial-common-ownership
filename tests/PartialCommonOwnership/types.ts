enum ErrorMessages {
  ONLY_OWNER = "Sender does not own this token",
  LEASE_TAKEOVER_ZERO_VALUATION = "New valuation cannot be zero",
  LEASE_TAKEOVER_INCORRECT_CURRENT_VALUATION = "Current valuation is incorrect",
  LEASE_TAKEOVER_VALUATION_BELOW_CURRENT = "New valuation must be >= current valuation",
  LEASE_TAKEOVER_LACKS_SURPLUS_VALUE = "Message does not contain surplus value for deposit",
  LEASE_TAKEOVER_ALREADY_OWNED = "Buyer is already owner",
  NEW_VALUATION_ZERO = "New valuation cannot be zero",
  NEW_VALUATION_SAME = "New valuation cannot be same",
  // Not testing reentrancy lock, currently.
  //LOCKED = "Token is locked",
  CANNOT_WITHDRAW_MORE_THAN_DEPOSITED = "Cannot withdraw more than deposited",
  NO_OUTSTANDING_REMITTANCE = "No outstanding remittance",
  PROHIBITED_TRANSFER_METHOD = "Transfers may only occur via purchase/foreclosure",
  BENEFICIARY_ONLY = "Current beneficiary only",
  NONEXISTENT_TOKEN = "Query for nonexistent token",
  PROHIBITED_SURPLUS_VALUE = "Msg contains surplus value",
  PROHIBITED_VALUE = "Msg contains value",
}

enum Events {
  APPROVAL = "Approval",
  TRANSFER = "Transfer",
  LEASE_TAKEOVER = "LogLeaseTakeover",
  OUTSTANDING_REMITTANCE = "LogOutstandingRemittance",
  FORECLOSURE = "LogForeclosure",
  COLLECTION = "LogCollection",
  REMITTANCE = "LogRemittance",
  BENEFICIARY_UPDATED = "LogBeneficiaryUpdated",
  VALUATION = "LogValuation",
}

enum RemittanceTriggers {
  LeaseTakeover,
  WithdrawnDeposit,
  OutstandingRemittance,
  TaxCollection,
}

export { ErrorMessages, Events, RemittanceTriggers };
