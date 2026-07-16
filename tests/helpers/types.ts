enum TOKENS {
  ONE = 1,
  TWO = 2,
  THREE = 3,
}

enum ERC721ErrorMessages {
  NONEXISTENT_TOKEN = "ERC721: query for nonexistent token",
  OWNER_NONEXISTENT_TOKEN = "ERC721: owner query for nonexistent token",
}

enum ERC721MetadataErrorMessages {
  NONEXISTENT_TOKEN = "ERC721Metadata: URI query for nonexistent token",
}

export { TOKENS, ERC721ErrorMessages, ERC721MetadataErrorMessages };
