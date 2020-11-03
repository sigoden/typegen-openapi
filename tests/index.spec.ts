import { generate } from "../src";


test("should works", () => {
  const petstore = require("./spec/petstore.json");
  const result = generate(petstore, {});
  expect(result).toMatchSnapshot();
});