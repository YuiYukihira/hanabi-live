{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    std = {
      url = "github:divnix/std";
      inputs.devshell.url = "github:numtide/devshell";
      inputs.nixago.url = "github:nix-community/nixago";
      inputs.n2c.url = "github:nlewo/nix2container";
    };
    flake-utils.url = "github:numtide/flake-utils";
    n2c.follows = "std/n2c";
    helpers.url = "sourcehut:~yuiyukihira/devshell";
  };

  outputs = { std, ... }@inputs:
    std.growOn {
      inherit inputs;
      cellsFrom = ./nix;
      cellBlocks = [
        (std.blockTypes.runnables "apps")
        (std.blockTypes.installables "packages")
        (std.blockTypes.devshells "devshells")
        (std.blockTypes.nixago "configs")
        (std.blockTypes.functions "devshellProfiles")
      ];
    } {
      packages = std.harvest inputs.self [[ "hanabi-live" "packages" ]];
      apps = std.harvest inputs.self [[ "hanabi-live" "apps" ]];
      devShells = std.harvest inputs.self [[ "_automation" "devshells" ]];
    };

  nixConfig = {
    extra-substituters = [ "https://yuiyukihira.cachix.org" ];
    extra-trusted-public-keys = [
      "yuiyukihira.cachix.org-1:TuN52rUDSZIRJLC1zbD7a53Z/sv4pZIDt/b55LuzEJ4="
    ];
  };
}
