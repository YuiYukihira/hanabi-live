{ inputs, cell }:
let
  inherit (inputs) nixpkgs std;
  l = nixpkgs.lib // builtins;
in l.mapAttrs (_: std.lib.dev.mkShell) {
  default = { ... }: {
    name = "hanabi-live devshell";

    imports = [
      std.std.devshellProfiles.default
      inputs.helpers.devshellProfiles.base
      cell.devshellProfiles.hanabi-live
    ];

    #services.hanabi-live = { enable = true; };
    services.postgres.enable = true;
  };
}
