#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "fileutils"

ROOT = File.expand_path("..", __dir__)
APP_ROOT = File.join(ROOT, "VaultScope")
PROJECT_NAME = "VaultScope"
PROJECT_DIR = File.join(ROOT, "#{PROJECT_NAME}.xcodeproj")
PBXPROJ_PATH = File.join(PROJECT_DIR, "project.pbxproj")
WORKSPACE_DIR = File.join(PROJECT_DIR, "project.xcworkspace")
WORKSPACE_DATA_PATH = File.join(WORKSPACE_DIR, "contents.xcworkspacedata")
SCHEME_DIR = File.join(PROJECT_DIR, "xcshareddata", "xcschemes")
SCHEME_PATH = File.join(SCHEME_DIR, "#{PROJECT_NAME}.xcscheme")

def oid(key)
  Digest::MD5.hexdigest(key)[0, 24].upcase
end

def comment(name)
  name.to_s.gsub("*/", "* /")
end

def q(value)
  value.include?("/") || value.include?(".") || value.include?("-") ? "\"#{value}\"" : value
end

swift_files = Dir.glob(File.join(APP_ROOT, "**/*.swift")).sort
localized_strings = Dir.glob(File.join(APP_ROOT, "**/*.lproj/Localizable.strings")).sort

raise "No Swift files found under #{APP_ROOT}" if swift_files.empty?

source_root_group_id = oid("group:source-root")
main_group_id = oid("group:main")
products_group_id = oid("group:products")
product_ref_id = oid("product:app")
target_id = oid("target:app")
project_id = oid("project:root")
sources_phase_id = oid("phase:sources")
frameworks_phase_id = oid("phase:frameworks")
resources_phase_id = oid("phase:resources")
project_config_list_id = oid("config-list:project")
target_config_list_id = oid("config-list:target")
project_debug_config_id = oid("config:project:debug")
project_release_config_id = oid("config:project:release")
target_debug_config_id = oid("config:target:debug")
target_release_config_id = oid("config:target:release")

leaf_dirs = swift_files
  .map { |path| File.dirname(path) }
  .concat(localized_strings.map { |path| File.dirname(File.dirname(path)) })
  .uniq
  .reject { |path| File.basename(path).end_with?(".lproj") }

group_dirs = leaf_dirs.each_with_object([]) do |dir, dirs|
  current = dir

  loop do
    dirs << current unless dirs.include?(current)
    break if current == APP_ROOT

    parent = File.dirname(current)
    break if parent == current || !parent.start_with?(APP_ROOT)

    current = parent
  end
end.sort

group_dirs.unshift(APP_ROOT) unless group_dirs.include?(APP_ROOT)

group_id_for = lambda do |dir|
  return source_root_group_id if dir == APP_ROOT

  oid("group:#{dir.delete_prefix("#{APP_ROOT}/")}")
end

file_ref_id_for = lambda do |path|
  oid("file-ref:#{path.delete_prefix("#{ROOT}/")}")
end

build_file_id_for = lambda do |path|
  oid("build-file:#{path.delete_prefix("#{ROOT}/")}")
end

variant_group_id_for = lambda do |parent_dir, basename|
  oid("variant-group:#{parent_dir.delete_prefix("#{APP_ROOT}/")}/#{basename}")
end

variant_child_id_for = lambda do |path|
  oid("variant-child:#{path.delete_prefix("#{ROOT}/")}")
end

resource_build_file_id_for = lambda do |parent_dir, basename|
  oid("resource-build-file:#{parent_dir.delete_prefix("#{APP_ROOT}/")}/#{basename}")
end

variant_entries_by_parent = Hash.new { |hash, key| hash[key] = [] }
localized_strings.each do |path|
  lproj_dir = File.dirname(path)
  locale = File.basename(lproj_dir, ".lproj")
  parent_dir = File.dirname(lproj_dir)
  basename = File.basename(path)
  variant_entries_by_parent[parent_dir] << {
    locale: locale,
    path: path,
    basename: basename
  }
end

pbx_build_files = []
pbx_file_refs = []
pbx_groups = []
pbx_variant_groups = []
source_build_ids = []
resource_build_ids = []

swift_files.each do |path|
  file_ref_id = file_ref_id_for.call(path)
  build_file_id = build_file_id_for.call(path)
  file_name = File.basename(path)
  relative_to_root = path.delete_prefix("#{ROOT}/")

  pbx_file_refs << <<~ENTRY.chomp
    #{file_ref_id} /* #{comment(file_name)} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = #{q(file_name)}; path = #{q(relative_to_root)}; sourceTree = SOURCE_ROOT; };
  ENTRY

  pbx_build_files << <<~ENTRY.chomp
    #{build_file_id} /* #{comment(file_name)} in Sources */ = {isa = PBXBuildFile; fileRef = #{file_ref_id} /* #{comment(file_name)} */; };
  ENTRY

  source_build_ids << "#{build_file_id} /* #{comment(file_name)} in Sources */"
end

variant_entries_by_parent.each do |parent_dir, entries|
  entries.group_by { |entry| entry[:basename] }.each do |basename, grouped_entries|
    variant_group_id = variant_group_id_for.call(parent_dir, basename)
    child_ids = grouped_entries.map { |entry| variant_child_id_for.call(entry[:path]) }

    grouped_entries.each do |entry|
      child_id = variant_child_id_for.call(entry[:path])
      relative_to_root = entry[:path].delete_prefix("#{ROOT}/")
      pbx_file_refs << <<~ENTRY.chomp
        #{child_id} /* #{comment(entry[:locale])} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = #{q(entry[:locale])}; path = #{q(relative_to_root)}; sourceTree = SOURCE_ROOT; };
      ENTRY
    end

    pbx_variant_groups << <<~ENTRY.chomp
      #{variant_group_id} /* #{comment(basename)} */ = {
        isa = PBXVariantGroup;
        children = (
#{child_ids.map { |id| "          #{id} /* #{comment(grouped_entries.find { |entry| variant_child_id_for.call(entry[:path]) == id }[:locale])} */," }.join("\n")}
        );
        name = #{q(basename)};
        sourceTree = "<group>";
      };
    ENTRY

    resource_build_id = resource_build_file_id_for.call(parent_dir, basename)
    pbx_build_files << <<~ENTRY.chomp
      #{resource_build_id} /* #{comment(basename)} in Resources */ = {isa = PBXBuildFile; fileRef = #{variant_group_id} /* #{comment(basename)} */; };
    ENTRY
    resource_build_ids << "#{resource_build_id} /* #{comment(basename)} in Resources */"
  end
end

group_dirs.each do |dir|
  group_id = group_id_for.call(dir)
  child_dir_ids = group_dirs
    .select { |candidate| File.dirname(candidate) == dir && candidate != APP_ROOT }
    .sort
    .map { |candidate| [group_id_for.call(candidate), File.basename(candidate)] }

  child_file_ids = swift_files
    .select { |path| File.dirname(path) == dir }
    .sort
    .map { |path| [file_ref_id_for.call(path), File.basename(path)] }

  child_variant_ids = variant_entries_by_parent.fetch(dir, [])
    .group_by { |entry| entry[:basename] }
    .keys
    .sort
    .map { |basename| [variant_group_id_for.call(dir, basename), basename] }

  children = child_dir_ids + child_variant_ids + child_file_ids

  lines = children.map do |child_id, name|
    "      #{child_id} /* #{comment(name)} */,"
  end.join("\n")

  attrs = []
  attrs << "isa = PBXGroup;"
  attrs << "children = (\n#{lines}\n    );"

  if dir == APP_ROOT
    attrs << "path = #{q(File.basename(APP_ROOT))};"
  else
    attrs << "path = #{q(File.basename(dir))};"
  end

  attrs << 'sourceTree = "<group>";'

  pbx_groups << <<~ENTRY.chomp
    #{group_id} /* #{comment(File.basename(dir))} */ = {
      #{attrs.join("\n      ")}
    };
  ENTRY
end

pbx_groups << <<~ENTRY.chomp
  #{main_group_id} = {
    isa = PBXGroup;
    children = (
      #{source_root_group_id} /* #{comment(File.basename(APP_ROOT))} */,
      #{products_group_id} /* Products */,
    );
    sourceTree = "<group>";
  };
ENTRY

pbx_groups << <<~ENTRY.chomp
  #{products_group_id} /* Products */ = {
    isa = PBXGroup;
    children = (
      #{product_ref_id} /* #{PROJECT_NAME}.app */,
    );
    name = Products;
    sourceTree = "<group>";
  };
ENTRY

pbx_file_refs << <<~ENTRY.chomp
  #{product_ref_id} /* #{PROJECT_NAME}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = #{PROJECT_NAME}.app; sourceTree = BUILT_PRODUCTS_DIR; };
ENTRY

pbxproj = <<~PBXPROJ
// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {
  };
  objectVersion = 56;
  objects = {

/* Begin PBXBuildFile section */
#{pbx_build_files.sort.join("\n")}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
#{pbx_file_refs.sort.join("\n")}
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
    #{frameworks_phase_id} /* Frameworks */ = {
      isa = PBXFrameworksBuildPhase;
      buildActionMask = 2147483647;
      files = (
      );
      runOnlyForDeploymentPostprocessing = 0;
    };
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
#{pbx_groups.sort.join("\n")}
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
    #{target_id} /* #{PROJECT_NAME} */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = #{target_config_list_id} /* Build configuration list for PBXNativeTarget "#{PROJECT_NAME}" */;
      buildPhases = (
        #{sources_phase_id} /* Sources */,
        #{frameworks_phase_id} /* Frameworks */,
        #{resources_phase_id} /* Resources */,
      );
      buildRules = (
      );
      dependencies = (
      );
      name = #{PROJECT_NAME};
      productName = #{PROJECT_NAME};
      productReference = #{product_ref_id} /* #{PROJECT_NAME}.app */;
      productType = "com.apple.product-type.application";
    };
/* End PBXNativeTarget section */

/* Begin PBXProject section */
    #{project_id} /* Project object */ = {
      isa = PBXProject;
      attributes = {
        BuildIndependentTargetsInParallel = 1;
        LastSwiftUpdateCheck = 2600;
        LastUpgradeCheck = 2600;
        TargetAttributes = {
          #{target_id} = {
            CreatedOnToolsVersion = 26.4;
          };
        };
      };
      buildConfigurationList = #{project_config_list_id} /* Build configuration list for PBXProject "#{PROJECT_NAME}" */;
      compatibilityVersion = "Xcode 14.0";
      developmentRegion = en;
      hasScannedForEncodings = 0;
      knownRegions = (
        en,
        Base,
      );
      mainGroup = #{main_group_id};
      productRefGroup = #{products_group_id} /* Products */;
      projectDirPath = "";
      projectRoot = "";
      targets = (
        #{target_id} /* #{PROJECT_NAME} */,
      );
    };
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
    #{resources_phase_id} /* Resources */ = {
      isa = PBXResourcesBuildPhase;
      buildActionMask = 2147483647;
      files = (
#{resource_build_ids.map { |id| "        #{id}," }.join("\n")}
      );
      runOnlyForDeploymentPostprocessing = 0;
    };
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
    #{sources_phase_id} /* Sources */ = {
      isa = PBXSourcesBuildPhase;
      buildActionMask = 2147483647;
      files = (
#{source_build_ids.map { |id| "        #{id}," }.join("\n")}
      );
      runOnlyForDeploymentPostprocessing = 0;
    };
/* End PBXSourcesBuildPhase section */

/* Begin PBXVariantGroup section */
#{pbx_variant_groups.sort.join("\n")}
/* End PBXVariantGroup section */

/* Begin XCBuildConfiguration section */
    #{project_debug_config_id} /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        CLANG_ENABLE_MODULES = YES;
        COPY_PHASE_STRIP = NO;
        DEVELOPMENT_TEAM = "";
        IPHONEOS_DEPLOYMENT_TARGET = 17.0;
        SDKROOT = iphoneos;
        SWIFT_VERSION = 5.0;
        TARGETED_DEVICE_FAMILY = "1,2";
      };
      name = Debug;
    };
    #{project_release_config_id} /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        CLANG_ENABLE_MODULES = YES;
        COPY_PHASE_STRIP = NO;
        DEVELOPMENT_TEAM = "";
        IPHONEOS_DEPLOYMENT_TARGET = 17.0;
        SDKROOT = iphoneos;
        SWIFT_VERSION = 5.0;
        TARGETED_DEVICE_FAMILY = "1,2";
      };
      name = Release;
    };
    #{target_debug_config_id} /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        CODE_SIGN_STYLE = Automatic;
        CURRENT_PROJECT_VERSION = 1;
        DEVELOPMENT_TEAM = "";
        ENABLE_PREVIEWS = YES;
        GENERATE_INFOPLIST_FILE = YES;
        INFOPLIST_KEY_CFBundleDisplayName = #{PROJECT_NAME};
        INFOPLIST_KEY_NSCameraUsageDescription = "VaultScope needs camera access to capture collectibles during scanning.";
        INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
        INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
        INFOPLIST_KEY_UILaunchScreen_Generation = YES;
        INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
        INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = UIInterfaceOrientationPortrait;
        IPHONEOS_DEPLOYMENT_TARGET = 17.0;
        LD_RUNPATH_SEARCH_PATHS = (
          "$(inherited)",
          "@executable_path/Frameworks",
        );
        MARKETING_VERSION = 1.0;
        PRODUCT_BUNDLE_IDENTIFIER = com.alexshipulin.VaultScope;
        PRODUCT_NAME = "$(TARGET_NAME)";
        SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
        SWIFT_EMIT_LOC_STRINGS = YES;
        SWIFT_VERSION = 5.0;
        TARGETED_DEVICE_FAMILY = "1,2";
      };
      name = Debug;
    };
    #{target_release_config_id} /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        CODE_SIGN_STYLE = Automatic;
        CURRENT_PROJECT_VERSION = 1;
        DEVELOPMENT_TEAM = "";
        ENABLE_PREVIEWS = YES;
        GENERATE_INFOPLIST_FILE = YES;
        INFOPLIST_KEY_CFBundleDisplayName = #{PROJECT_NAME};
        INFOPLIST_KEY_NSCameraUsageDescription = "VaultScope needs camera access to capture collectibles during scanning.";
        INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
        INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
        INFOPLIST_KEY_UILaunchScreen_Generation = YES;
        INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
        INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = UIInterfaceOrientationPortrait;
        IPHONEOS_DEPLOYMENT_TARGET = 17.0;
        LD_RUNPATH_SEARCH_PATHS = (
          "$(inherited)",
          "@executable_path/Frameworks",
        );
        MARKETING_VERSION = 1.0;
        PRODUCT_BUNDLE_IDENTIFIER = com.alexshipulin.VaultScope;
        PRODUCT_NAME = "$(TARGET_NAME)";
        SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
        SWIFT_EMIT_LOC_STRINGS = YES;
        SWIFT_VERSION = 5.0;
        TARGETED_DEVICE_FAMILY = "1,2";
      };
      name = Release;
    };
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
    #{project_config_list_id} /* Build configuration list for PBXProject "#{PROJECT_NAME}" */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        #{project_debug_config_id} /* Debug */,
        #{project_release_config_id} /* Release */,
      );
      defaultConfigurationIsVisible = 0;
      defaultConfigurationName = Release;
    };
    #{target_config_list_id} /* Build configuration list for PBXNativeTarget "#{PROJECT_NAME}" */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        #{target_debug_config_id} /* Debug */,
        #{target_release_config_id} /* Release */,
      );
      defaultConfigurationIsVisible = 0;
      defaultConfigurationName = Release;
    };
/* End XCConfigurationList section */

  };
  rootObject = #{project_id} /* Project object */;
}
PBXPROJ

scheme = <<~SCHEME
<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "2600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "#{target_id}"
               BuildableName = "#{PROJECT_NAME}.app"
               BlueprintName = "#{PROJECT_NAME}"
               ReferencedContainer = "container:#{PROJECT_NAME}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "#{target_id}"
            BuildableName = "#{PROJECT_NAME}.app"
            BlueprintName = "#{PROJECT_NAME}"
            ReferencedContainer = "container:#{PROJECT_NAME}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "#{target_id}"
            BuildableName = "#{PROJECT_NAME}.app"
            BlueprintName = "#{PROJECT_NAME}"
            ReferencedContainer = "container:#{PROJECT_NAME}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
SCHEME

workspace = <<~WORKSPACE
<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
   <FileRef
      location = "self:">
   </FileRef>
</Workspace>
WORKSPACE

FileUtils.mkdir_p(PROJECT_DIR)
FileUtils.mkdir_p(WORKSPACE_DIR)
FileUtils.mkdir_p(SCHEME_DIR)

File.write(PBXPROJ_PATH, pbxproj)
File.write(WORKSPACE_DATA_PATH, workspace)
File.write(SCHEME_PATH, scheme)

puts "Generated #{PROJECT_DIR}"
