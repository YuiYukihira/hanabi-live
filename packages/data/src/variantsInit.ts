import { ReadonlySet } from "@hanabi/utils";
import { ALL_RESERVED_NOTES } from "./abbreviations";
import { DEFAULT_CARD_RANKS, DEFAULT_CLUE_RANKS } from "./constants";
import variantsJSON from "./json/variants.json";
import { getIdentityNotePatternForVariant } from "./notes";
import type { Color } from "./types/Color";
import type { Suit } from "./types/Suit";
import type { Variant } from "./types/Variant";
import type { VariantJSON } from "./types/VariantJSON";

/** Some suits have a "Dark" prefix and we want to skip over those letters. */
const SUIT_ABBREVIATION_BLACKLIST = new ReadonlySet(["d", "a", "r", "k"]);

export function variantsInit(
  COLORS: ReadonlyMap<string, Color>,
  SUITS: ReadonlyMap<string, Suit>,
  START_CARD_RANK: number,
): ReadonlyMap<string, Variant> {
  const variants = new Map<string, Variant>();

  if (variantsJSON.length === 0) {
    throw new Error(
      'The "variants.json" file did not have any elements in it.',
    );
  }

  for (const variantJSON of variantsJSON as VariantJSON[]) {
    // Validate the name
    const { name } = variantJSON;
    if (name === "") {
      throw new Error(
        'There is a variant with an empty name in the "variants.json" file.',
      );
    }

    // Validate the ID. (The first variant has an ID of 0.)
    const { id } = variantJSON;
    if (id < 0) {
      throw new Error(`The "${name}" variant has an invalid ID.`);
    }

    // Validate the suits
    if (!Object.hasOwnProperty.call(variantJSON, "suits")) {
      throw new Error(`The "${name}" variant does not have suits.`);
    }
    if (!Array.isArray(variantJSON.suits)) {
      throw new TypeError(
        `The suits for the variant "${name}" were not specified as an array.`,
      );
    }
    if (variantJSON.suits.length === 0) {
      throw new Error(`The suits for the variant "${name}" is empty.`);
    }

    // The suits are specified as an array of strings. Convert the strings to objects.
    const suits: Suit[] = [];
    for (const suitName of variantJSON.suits) {
      if (typeof suitName !== "string") {
        throw new TypeError(
          `One of the suits for the variant "${name}" was not specified as a string.`,
        );
      }

      const suit = SUITS.get(suitName);
      if (suit !== undefined) {
        suits.push(suit);
      } else {
        throw new Error(
          `The suit "${suitName}" in the variant "${name}" does not exist.`,
        );
      }
    }

    // Derive the ranks that the cards of each suit will be.
    const ranks: number[] = [...DEFAULT_CARD_RANKS];
    if (name.startsWith("Up or Down")) {
      // The "Up or Down" variants have START cards.
      ranks.push(START_CARD_RANK);
    }

    // Validate the clue colors (the colors available to clue in this variant).
    const clueColors: Color[] = [];
    if (Object.hasOwnProperty.call(variantJSON, "clueColors")) {
      if (!Array.isArray(variantJSON.clueColors)) {
        throw new TypeError(
          `The clue colors for the variant "${name}" were not specified as an array.`,
        );
      }

      // The clue colors are specified as an array of strings. Convert the strings to objects.
      for (const colorString of variantJSON.clueColors) {
        if (typeof colorString !== "string") {
          throw new TypeError(
            `One of the clue colors for the variant "${name}" was not specified as a string.`,
          );
        }

        const colorObject = COLORS.get(colorString);
        if (colorObject !== undefined) {
          clueColors.push(colorObject);
        } else {
          throw new Error(
            `The color "${colorString}" in the variant "${name}" does not exist.`,
          );
        }
      }
    } else {
      // The clue colors were not specified in the JSON, so derive them from the suits.
      for (const suit of suits) {
        if (suit.allClueColors) {
          // If a suit is touched by all colors, then we don't want to add every single clue color
          // to the variant clue list.
          continue;
        }
        for (const color of suit.clueColors) {
          if (!clueColors.includes(color)) {
            clueColors.push(color);
          }
        }
      }
    }

    // Validate the clue ranks (the ranks available to clue in this variant). If it is not
    // specified, assume that players can clue ranks 1 through 5.
    if (Object.hasOwnProperty.call(variantJSON, "clueRanks")) {
      if (!Array.isArray(variantJSON.clueRanks)) {
        throw new TypeError(
          `The clue ranks for the variant "${name}" were not specified as an array.`,
        );
      }

      for (const rank of variantJSON.clueRanks) {
        if (typeof rank !== "number") {
          throw new TypeError(
            `One of the clue ranks for the variant "${name}" was not a number.`,
          );
        }
      }
    }
    const clueRanks = variantJSON.clueRanks ?? [...DEFAULT_CLUE_RANKS];

    // Validate the "colorCluesTouchNothing" property. If it is not specified, assume false (e.g.
    // cluing colors in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "colorCluesTouchNothing") &&
      variantJSON.colorCluesTouchNothing !== true
    ) {
      throw new Error(
        `The "colorCluesTouchNothing" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const colorCluesTouchNothing = variantJSON.colorCluesTouchNothing ?? false;

    // Validate the "rankCluesTouchNothing" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "rankCluesTouchNothing") &&
      variantJSON.rankCluesTouchNothing !== true
    ) {
      throw new Error(
        `The "rankCluesTouchNothing" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const rankCluesTouchNothing = variantJSON.rankCluesTouchNothing ?? false;

    // Validate the "specialRank" property (e.g. for "Rainbow-Ones"). If it is not specified, assume
    // -1 (e.g. there are no special ranks).
    if (Object.hasOwnProperty.call(variantJSON, "specialRank")) {
      if (typeof variantJSON.specialRank !== "number") {
        throw new TypeError(
          `The "specialRank" property for the variant "${variantJSON.name}" must be a number.`,
        );
      }

      if (variantJSON.specialRank < 1 || variantJSON.specialRank > 5) {
        throw new Error(
          `The "specialRank" property for the variant "${variantJSON.name}" must be between 1 and 5.`,
        );
      }
    }
    const specialRank = variantJSON.specialRank ?? -1;

    // Validate the "specialAllClueColors" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "specialAllClueColors") &&
      variantJSON.specialAllClueColors !== true
    ) {
      throw new Error(
        `The "specialAllClueColors" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const specialAllClueColors = variantJSON.specialAllClueColors ?? false;

    // Validate the "specialAllClueRanks" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "specialAllClueRanks") &&
      variantJSON.specialAllClueRanks !== true
    ) {
      throw new Error(
        `The "specialAllClueRanks" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const specialAllClueRanks = variantJSON.specialAllClueRanks ?? false;

    // Validate the "specialNoClueColors" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "specialNoClueColors") &&
      variantJSON.specialNoClueColors !== true
    ) {
      throw new Error(
        `The "specialNoClueColors" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const specialNoClueColors = variantJSON.specialNoClueColors ?? false;

    // Validate the "specialNoClueRanks" property. If it is not specified, assume false (e.g. cluing
    // ranks in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "specialNoClueRanks") &&
      variantJSON.specialNoClueRanks !== true
    ) {
      throw new Error(
        `The "specialNoClueRanks" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const specialNoClueRanks = variantJSON.specialNoClueRanks ?? false;

    // Validate the "specialDeceptive" property. If it is not specified, assume false (e.g. cluing
    // ranks in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "specialDeceptive") &&
      variantJSON.specialDeceptive !== true
    ) {
      throw new Error(
        `The "specialDeceptive" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const specialDeceptive = variantJSON.specialDeceptive ?? false;

    // Validate the "oddsAndEvens" property. If it is not specified, assume false (e.g. cluing ranks
    // in this variant works normally).
    if (
      Object.hasOwnProperty.call(variantJSON, "oddsAndEvens") &&
      variantJSON.oddsAndEvens !== true
    ) {
      throw new Error(
        `The "oddsAndEvens" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const oddsAndEvens = variantJSON.oddsAndEvens ?? false;

    // Validate the "funnels" property. If it is not specified, assume false
    // (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, "funnels") &&
      variantJSON.funnels !== true
    ) {
      throw new Error(
        `The "funnels" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const funnels = variantJSON.funnels ?? false;

    // Validate the "chimneys" property. If it is not specified, assume false
    // (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, "chimneys") &&
      variantJSON.chimneys !== true
    ) {
      throw new Error(
        `The "chimneys" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    const chimneys = variantJSON.chimneys ?? false;

    // Validate the "showSuitNames" property. If it is not specified, assume that we are not showing
    // the suit names.
    if (
      Object.hasOwnProperty.call(variantJSON, "showSuitNames") &&
      variantJSON.showSuitNames !== true
    ) {
      throw new Error(
        `The "showSuitNames" property for the variant "${variantJSON.name}" must be set to true.`,
      );
    }
    let showSuitNames = variantJSON.showSuitNames ?? false;

    // Always set "showSuitNames" to true if it has one or more reversed suits.
    if (suits.some((suit: Suit) => suit.reversed)) {
      showSuitNames = true;
    }

    // Assume 5 cards per stack.
    const maxScore = suits.length * 5;

    // Variants with dual-color suits need to adjust the positions of elements in the corner of the
    // card (e.g. the note indicator) because it will overlap with the triangle that shows the color
    // composition of the suit.
    const offsetCornerElements = suits.some(
      (suit: Suit) => suit.clueColors.length > 1,
    );

    // Prepare the abbreviations for each suit.
    const suitAbbreviations = getSuitAbbreviationsForVariant(name, suits);

    // Create the regular expression pattern for identity notes in this variant.
    const identityNotePattern = getIdentityNotePatternForVariant(
      suits,
      ranks,
      suitAbbreviations,
      name.startsWith("Up or Down"),
    );

    // Add it to the map.
    const variant: Variant = {
      name,
      id,
      suits,
      ranks,
      clueColors,
      clueRanks,
      colorCluesTouchNothing,
      rankCluesTouchNothing,
      specialRank,
      specialAllClueColors,
      specialAllClueRanks,
      specialNoClueColors,
      specialNoClueRanks,
      specialDeceptive,
      oddsAndEvens,
      funnels,
      chimneys,
      showSuitNames,
      maxScore,
      offsetCornerElements,
      suitAbbreviations,
      identityNotePattern,
    };
    variants.set(variantJSON.name, variant);
  }

  return variants;
}

function getSuitAbbreviationsForVariant(
  variantName: string,
  suits: Suit[],
): readonly string[] {
  const abbreviations: string[] = [];

  for (const suit of suits) {
    const abbreviationToUse = getSuitAbbreviationToUse(
      variantName,
      suit,
      abbreviations,
    );
    abbreviations.push(abbreviationToUse);
  }

  // Validate that each suit has a unique abbreviation.
  const abbreviationSet = new Set(abbreviations);
  if (abbreviationSet.size !== abbreviations.length) {
    throw new Error(
      `The variant "${variantName}" has two suits with the same abbreviation: ${abbreviations}`,
    );
  }

  return abbreviations.map((abbreviation) => abbreviation.toUpperCase());
}

/**
 * Suit abbreviations are hard-coded in the "suits.json" file. In some variants, two or more suits
 * can have overlapping letter abbreviations. If this is the case, we dynamically find a new
 * abbreviation by using the left-most unused letter of the suit.
 *
 * Note that we cannot simply hard-code an alternate abbreviation in the "suits.json" file because
 * there are too many overlapping possibilities.
 */
function getSuitAbbreviationToUse(
  variantName: string,
  suit: Suit,
  abbreviationsUsedSoFar: string[],
): string {
  const lowercaseAbbreviation = suit.abbreviation.toLowerCase();
  if (!abbreviationsUsedSoFar.includes(lowercaseAbbreviation)) {
    return lowercaseAbbreviation;
  }

  // There is an overlap with the normal abbreviation.
  for (const suitLetterUppercase of suit.displayName) {
    const suitLetterLowercase = suitLetterUppercase.toLowerCase();
    if (
      !abbreviationsUsedSoFar.includes(suitLetterLowercase) &&
      !ALL_RESERVED_NOTES.has(suitLetterLowercase) && // e.g. Ban "f"
      !SUIT_ABBREVIATION_BLACKLIST.has(suitLetterLowercase) // e.g. Ban "d"
    ) {
      return suitLetterLowercase;
    }
  }

  throw new Error(
    `Failed to find a suit abbreviation for "${suit.name}" in the variant of "${variantName}". (We went through every letter and did not find a match.)`,
  );
}
