module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/../tests"],
  moduleFileExtensions: ["ts", "js", "json"],
  modulePaths: ["<rootDir>/node_modules", "<rootDir>/../node_modules"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/../tests/tsconfig.json",
      },
    ],
  },
};
