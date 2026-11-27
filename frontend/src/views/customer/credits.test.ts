/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { EVENT_CREDITS, PRODUCT_CREDITS, SITE_CREDITS } from "./credits";

// File names of every image in a folder, found by Vite at test time.
const names = (files: Record<string, unknown>) => Object.keys(files).map(path => path.split("/").pop()!).sort();
const SITE_IMAGES = names(import.meta.glob("../../../assets/images/**/*.{png,jpg,jpeg,webp}"));
const PRODUCT_IMAGES = names(import.meta.glob("../../../../database/Mockdata/images/*.{png,jpg,jpeg,webp}"));

describe("photo credits", () => {
  it("credits every image on the site", () => {
    expect(SITE_IMAGES.length).toBeGreaterThan(0);
    expect(SITE_CREDITS.map(credit => credit.file).sort()).toEqual(SITE_IMAGES);
  });

  it("credits every sample item and event photo", () => {
    expect(PRODUCT_IMAGES.length).toBeGreaterThan(0);
    expect([...PRODUCT_CREDITS, ...EVENT_CREDITS].map(credit => credit.file).sort()).toEqual(PRODUCT_IMAGES);
  });

  it("links each Creative Commons credit to its license", () => {
    for (const credit of [...PRODUCT_CREDITS, ...EVENT_CREDITS]) {
      expect(credit.licenseUrl, credit.file).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(credit.source, credit.file).toMatch(/^https:\/\/(commons\.wikimedia\.org\/wiki\/File:|www\.flickr\.com\/photos\/)/);
    }
  });
});
