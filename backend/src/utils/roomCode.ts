import crypto from "crypto";

// crypto.randomInt et pas Math.random : un code de salle permet de rejoindre
// une partie, et Math.random devient previsible quand on observe ses tirages.
// Alphabet sans 0, O, 1 et I : un code se dicte a l'oral sans confusion.
export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}
