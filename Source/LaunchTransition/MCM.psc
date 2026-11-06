; Compile-time interface only. The separately installed MCM supplies the runtime.
Scriptname MCM Native Hidden
Int Function GetModSettingInt(String modName, String setting) Global Native
Bool Function GetModSettingBool(String modName, String setting) Global Native
String Function GetModSettingString(String modName, String setting) Global Native
Function SetModSettingInt(String modName, String setting, Int value) Global Native
Function SetModSettingBool(String modName, String setting, Bool value) Global Native
Function SetModSettingString(String modName, String setting, String value) Global Native
Function RefreshMenu() Global Native
