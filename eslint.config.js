export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script", // <-- change here
    },
    rules: {
      semi: "error",
      quotes: ["error", "double"],
      // add more rules as needed
    },
  },
];
