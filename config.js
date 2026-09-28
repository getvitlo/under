/* ---------------------------------------------------------------
   Under — your settings live here.
   Edit this file, commit, done. Nothing else needs touching.
   --------------------------------------------------------------- */

window.UNDER_CONFIG = {

  /* The two of you. `key` is stored with every purchase — keep them
     short and never change them once you've started logging. */
  people: [
    { key: "H", name: "Hani" },
    { key: "F", name: "Fatima" }
  ],

  /* Shared spending that belongs to neither of you alone. */
  jointLabel: "Joint",

  /* Daily cap per person, and the currency. */
  defaultCap: 4.5,
  currency: "BHD",          // BHD KWD OMR AED SAR QAR GBP USD EUR

  /* ---- Sharing -----------------------------------------------------
     Leave supabaseUrl empty and the app still works, but only on the
     one device and with no sign-in.

     To share: make a free project at supabase.com, run supabase.sql,
     then paste the project URL and the anon public key below.

     You each create your own account in the app. The first time you
     sign in it asks which of you you are and for the household code
     below — enter the same code on both accounts and you're looking
     at the same books. Anything random works; the README has more. */
  supabaseUrl: "",
  supabaseAnonKey: "",
  householdId: "change-me-to-something-random"   // the code you both enter once
};
