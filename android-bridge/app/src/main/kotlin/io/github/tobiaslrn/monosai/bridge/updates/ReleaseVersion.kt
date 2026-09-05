package io.github.tobiaslrn.monosai.bridge.updates

/** bridge-vMAJOR.MINOR.PATCH; each component has a fixed range, so ordering never overlaps. */
fun releaseVersionCode(tag: String): Int? {
    val match = Regex("bridge-v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)").matchEntire(tag) ?: return null
    val (major, minor, patch) = match.destructured
    val a = major.toLongOrNull() ?: return null
    val b = minor.toLongOrNull() ?: return null
    val c = patch.toLongOrNull() ?: return null
    if (a > 2099 || b > 999 || c > 999) return null
    return (a * 1_000_000 + b * 1_000 + c).takeIf { it in 1..2_100_000_000 }?.toInt()
}
