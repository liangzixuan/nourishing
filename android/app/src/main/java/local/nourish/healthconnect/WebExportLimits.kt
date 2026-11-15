package local.nourish.healthconnect

/** File limit matches server/backup.mjs; memory transfers retain a smaller bound. */
object WebExportLimits {
    const val MEMORY_BYTES=32*1024*1024
    const val FILE_BYTES=1024L*1024*1024
}
